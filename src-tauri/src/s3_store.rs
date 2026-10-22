use crate::AppConfig;
use hmac::{Hmac, Mac};
use reqwest::blocking::Client;
use reqwest::Method;
use sha2::{Digest, Sha256};
use std::time::Duration;

pub const DEFAULT_S3_ENDPOINT: &str = "";
pub const DEFAULT_S3_BUCKET: &str = "mdnote";
pub const DEFAULT_S3_OBJECT_KEY: &str = "MDnote/messages.json";

const REGION: &str = "us-east-1";
const SERVICE: &str = "s3";

type HmacSha256 = Hmac<Sha256>;

pub struct S3Store {
    http: Client,
    endpoint: String,
    host: String,
    bucket: String,
    object_key: String,
    access_key: String,
    secret_key: String,
}

impl S3Store {
    pub fn from_config(config: &AppConfig) -> Result<Self, String> {
        let endpoint = config
            .s3_endpoint
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(DEFAULT_S3_ENDPOINT);
        let bucket = config
            .s3_bucket
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(DEFAULT_S3_BUCKET)
            .to_string();
        let object_key = config
            .s3_object_key
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(DEFAULT_S3_OBJECT_KEY)
            .trim()
            .trim_start_matches('/')
            .to_string();
        let access_key = config
            .s3_access_key
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_string();
        let secret_key = config
            .s3_secret_key
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_string();
        if access_key.is_empty() {
            return Err("请填写 S3 Access Key".into());
        }
        if secret_key.is_empty() {
            return Err("请填写 S3 Secret Key".into());
        }

        let endpoint = normalize_endpoint(endpoint)?;
        let host = endpoint
            .trim_start_matches("http://")
            .trim_start_matches("https://")
            .to_string();
        let http = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        Ok(Self {
            http,
            endpoint,
            host,
            bucket,
            object_key,
            access_key,
            secret_key,
        })
    }

    fn object_url(&self) -> String {
        format!(
            "{}/{}/{}",
            self.endpoint.trim_end_matches('/'),
            self.bucket,
            self.object_key
        )
    }

    fn canonical_uri(&self) -> String {
        format!("/{}/{}", self.bucket, self.object_key)
    }

    fn sign_request(
        &self,
        method: Method,
        body: Option<&[u8]>,
        content_type: Option<&str>,
        if_match: Option<&str>,
        if_none_match: bool,
    ) -> Result<reqwest::blocking::Request, String> {
        let amz_date = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = &amz_date[..8];
        let payload_hash = body.map(sha256_hex).unwrap_or_else(|| sha256_hex(b""));

        let mut headers = vec![
            ("host", self.host.clone()),
            ("x-amz-content-sha256", payload_hash.clone()),
            ("x-amz-date", amz_date.clone()),
        ];
        if let Some(ct) = content_type {
            headers.push(("content-type", ct.to_string()));
        }
        if let Some(value) = if_match {
            headers.push(("if-match", value.to_string()));
        }
        if if_none_match {
            headers.push(("if-none-match", "*".to_string()));
        }
        headers.sort_by(|left, right| left.0.cmp(right.0));
        let canonical_headers = headers
            .iter()
            .map(|(name, value)| format!("{name}:{value}\n"))
            .collect::<String>();
        let signed_headers = headers
            .iter()
            .map(|(name, _)| *name)
            .collect::<Vec<_>>()
            .join(";");

        let canonical_request = format!(
            "{method}\n{uri}\n\n{headers}\n{signed_headers}\n{payload_hash}",
            method = method.as_str(),
            uri = self.canonical_uri(),
            headers = canonical_headers,
            signed_headers = signed_headers,
            payload_hash = payload_hash,
        );

        let credential_scope = format!("{date_stamp}/{REGION}/{SERVICE}/aws4_request");
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{hash}",
            amz_date = amz_date,
            scope = credential_scope,
            hash = sha256_hex(canonical_request.as_bytes()),
        );

        let signing_key = signing_key(&self.secret_key, date_stamp, REGION, SERVICE);
        let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

        let authorization = format!(
            "AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
            access = self.access_key,
            scope = credential_scope,
            signed_headers = signed_headers,
            signature = signature,
        );

        let mut req = self
            .http
            .request(method, self.object_url())
            .header("Host", &self.host)
            .header("x-amz-date", &amz_date)
            .header("x-amz-content-sha256", payload_hash)
            .header("Authorization", authorization);

        if let Some(ct) = content_type {
            req = req.header("Content-Type", ct);
        }
        if let Some(value) = if_match {
            req = req.header("If-Match", value);
        }
        if if_none_match {
            req = req.header("If-None-Match", "*");
        }
        if let Some(data) = body {
            req = req.body(data.to_vec());
        }
        req.build().map_err(|e| format!("S3 请求构建失败：{e}"))
    }

    pub fn get_bytes(&self) -> Result<Vec<u8>, String> {
        self.get_bytes_with_etag().map(|(bytes, _)| bytes)
    }

    pub fn get_bytes_with_etag(&self) -> Result<(Vec<u8>, Option<String>), String> {
        Ok(self
            .get_optional_bytes_with_etag()?
            .unwrap_or((Vec::new(), None)))
    }

    pub fn get_optional_bytes_with_etag(
        &self,
    ) -> Result<Option<(Vec<u8>, Option<String>)>, String> {
        let req = self.sign_request(Method::GET, None, None, None, false)?;
        let resp = self
            .http
            .execute(req)
            .map_err(|e| format!("S3 连接失败：{e}"))?;
        let status = resp.status();
        if status.as_u16() == 404 {
            return Ok(None);
        }
        if !status.is_success() {
            let text = resp.text().unwrap_or_default();
            return Err(format!(
                "S3 读取失败 HTTP {status}（{}/{}）：{text}",
                self.bucket, self.object_key
            ));
        }
        let etag = resp
            .headers()
            .get("etag")
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);
        let bytes = resp
            .bytes()
            .map(|b| b.to_vec())
            .map_err(|e| format!("S3 读取响应失败：{e}"))?;
        Ok(Some((bytes, etag)))
    }

    pub fn put_bytes(&self, body: &[u8]) -> Result<(), String> {
        self.put_bytes_conditionally(body, None, false)
    }

    pub fn put_bytes_if_match(&self, body: &[u8], etag: &str) -> Result<(), String> {
        self.put_bytes_conditionally(body, Some(etag), false)
    }

    pub fn put_bytes_if_none_match(&self, body: &[u8]) -> Result<(), String> {
        self.put_bytes_conditionally(body, None, true)
    }

    fn put_bytes_conditionally(
        &self,
        body: &[u8],
        if_match: Option<&str>,
        if_none_match: bool,
    ) -> Result<(), String> {
        let req = self.sign_request(
            Method::PUT,
            Some(body),
            Some("application/json"),
            if_match,
            if_none_match,
        )?;
        let resp = self
            .http
            .execute(req)
            .map_err(|e| format!("S3 连接失败：{e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().unwrap_or_default();
            return Err(format!(
                "S3 写入失败 HTTP {status}（{}/{}）：{text}",
                self.bucket, self.object_key
            ));
        }
        Ok(())
    }

    pub fn test_connection(&self) -> Result<(), String> {
        self.get_bytes().map(|_| ())
    }
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac key");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn signing_key(secret: &str, date_stamp: &str, region: &str, service: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{secret}").as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

pub fn normalize_endpoint(raw: &str) -> Result<String, String> {
    let t = raw.trim().to_string();
    if t.is_empty() {
        return Err("请填写 S3 Endpoint".into());
    }
    if !t.starts_with("https://") {
        return Err("S3 Endpoint 必须使用 HTTPS".into());
    }
    Ok(t.trim_end_matches('/').to_string())
}

pub fn normalize_object_key(raw: &str) -> String {
    raw.trim().trim_start_matches('/').to_string()
}

pub fn set_s3_config(
    endpoint: Option<&str>,
    bucket: Option<&str>,
    object_key: Option<&str>,
    access_key: Option<&str>,
    secret_key: Option<&str>,
) -> Result<AppConfig, String> {
    crate::update_config(|config| {
        if let Some(v) = endpoint {
            let t = v.trim();
            config.s3_endpoint = if t.is_empty() {
                None
            } else {
                Some(normalize_endpoint(t)?)
            };
        }
        if let Some(v) = bucket {
            let t = v.trim();
            config.s3_bucket = if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            };
        }
        if let Some(v) = object_key {
            let t = v.trim();
            config.s3_object_key = if t.is_empty() {
                None
            } else {
                Some(normalize_object_key(t))
            };
        }
        if let Some(v) = access_key {
            let t = v.trim();
            config.s3_access_key = if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            };
        }
        if let Some(v) = secret_key {
            let t = v.trim();
            config.s3_secret_key = if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            };
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn normalize_object_key_strips_leading_slash() {
        assert_eq!(
            normalize_object_key("/MDnote/messages.json"),
            "MDnote/messages.json"
        );
    }

    #[test]
    fn endpoint_rejects_plain_http_and_missing_scheme() {
        assert!(normalize_endpoint("http://127.0.0.1:9000").is_err());
        assert!(normalize_endpoint("127.0.0.1:9000").is_err());
    }

    #[test]
    fn put_payload_uses_real_sha256_signature_hash() {
        let mut config = AppConfig::default();
        config.s3_endpoint = Some("https://example.test".into());
        config.s3_bucket = Some("bucket".into());
        config.s3_access_key = Some("access".into());
        config.s3_secret_key = Some("secret".into());
        let store = S3Store::from_config(&config).expect("valid test config");
        let request = store
            .sign_request(
                Method::PUT,
                Some(b"hello"),
                Some("application/json"),
                None,
                false,
            )
            .expect("request builds");
        assert_eq!(
            request
                .headers()
                .get("x-amz-content-sha256")
                .and_then(|value| value.to_str().ok()),
            Some(sha256_hex(b"hello").as_str())
        );
    }

    #[test]
    fn conditional_put_signs_if_match_header() {
        let mut config = AppConfig::default();
        config.s3_endpoint = Some("https://example.test".into());
        config.s3_bucket = Some("bucket".into());
        config.s3_access_key = Some("access".into());
        config.s3_secret_key = Some("secret".into());
        let store = S3Store::from_config(&config).expect("valid test config");
        let request = store
            .sign_request(
                Method::PUT,
                Some(b"hello"),
                Some("application/json"),
                Some("\"etag-1\""),
                false,
            )
            .expect("request builds");
        assert_eq!(
            request.headers().get("if-match").and_then(|value| value.to_str().ok()),
            Some("\"etag-1\"")
        );
        assert!(request
            .headers()
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("if-match")));
    }

    #[test]
    fn create_only_put_signs_if_none_match_header() {
        let mut config = AppConfig::default();
        config.s3_endpoint = Some("https://example.test".into());
        config.s3_bucket = Some("bucket".into());
        config.s3_access_key = Some("access".into());
        config.s3_secret_key = Some("secret".into());
        let store = S3Store::from_config(&config).expect("valid test config");
        let request = store
            .sign_request(Method::PUT, Some(b"hello"), Some("application/json"), None, true)
            .expect("request builds");
        assert_eq!(
            request
                .headers()
                .get("if-none-match")
                .and_then(|value| value.to_str().ok()),
            Some("*")
        );
        assert!(request
            .headers()
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("if-none-match")));
    }

    #[test]
    fn get_bytes_propagates_http_503_from_test_server() {
        let (endpoint, server) = spawn_test_server(
            "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 3\r\nConnection: close\r\n\r\nbad",
            Duration::ZERO,
        );
        let store = test_store(&endpoint, Duration::from_secs(1));

        let error = store.get_bytes().expect_err("503 must not be treated as missing");

        assert!(error.contains("HTTP 503"));
        server.join().unwrap();
    }

    #[test]
    fn get_bytes_reports_connection_timeout_from_test_server() {
        let (endpoint, server) = spawn_test_server("", Duration::from_millis(250));
        let store = test_store(&endpoint, Duration::from_millis(50));

        let error = store.get_bytes().expect_err("slow server must time out");

        assert!(error.contains("S3 连接失败"));
        server.join().unwrap();
    }

    #[test]
    fn get_bytes_reports_interrupted_response_from_test_server() {
        let (endpoint, server) = spawn_test_server(
            "HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\nabc",
            Duration::ZERO,
        );
        let store = test_store(&endpoint, Duration::from_secs(1));

        let error = store
            .get_bytes()
            .expect_err("提前断开的响应必须被视为读取失败");

        assert!(error.contains("S3 读取响应失败") || error.contains("S3 连接失败"));
        server.join().unwrap();
    }

    #[test]
    fn optional_get_distinguishes_missing_object_from_empty_object() {
        let (missing_endpoint, missing_server) = spawn_test_server(
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            Duration::ZERO,
        );
        let missing_store = test_store(&missing_endpoint, Duration::from_secs(1));
        assert!(missing_store
            .get_optional_bytes_with_etag()
            .unwrap()
            .is_none());
        missing_server.join().unwrap();

        let (empty_endpoint, empty_server) = spawn_test_server(
            "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            Duration::ZERO,
        );
        let empty_store = test_store(&empty_endpoint, Duration::from_secs(1));
        assert_eq!(
            empty_store
                .get_optional_bytes_with_etag()
                .unwrap()
                .unwrap()
                .0,
            Vec::<u8>::new()
        );
        empty_server.join().unwrap();
    }

    #[test]
    fn put_bytes_propagates_http_503_from_test_server() {
        let (endpoint, server) = spawn_test_server(
            "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 3\r\nConnection: close\r\n\r\nbad",
            Duration::ZERO,
        );
        let store = test_store(&endpoint, Duration::from_secs(1));

        let error = store
            .put_bytes(b"payload")
            .expect_err("503 must fail the write");

        assert!(error.contains("HTTP 503"));
        server.join().unwrap();
    }

    fn test_store(endpoint: &str, timeout: Duration) -> S3Store {
        let http = Client::builder().no_proxy().timeout(timeout).build().unwrap();
        S3Store {
            http,
            endpoint: endpoint.to_string(),
            host: endpoint
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .to_string(),
            bucket: "bucket".to_string(),
            object_key: "object.json".to_string(),
            access_key: "access".to_string(),
            secret_key: "secret".to_string(),
        }
    }

    fn spawn_test_server(response: &str, delay: Duration) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let response = response.to_string();
        let server = thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(std::time::Instant::now() < deadline, "local fixture was not contacted");
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("local fixture accept: {error}"),
                }
            };
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            read_test_request(&mut stream);
            if !delay.is_zero() {
                thread::sleep(delay);
            }
            if !response.is_empty() {
                let _ = stream.write_all(response.as_bytes());
            }
        });
        (format!("http://{address}"), server)
    }

    fn read_test_request(stream: &mut std::net::TcpStream) {
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let Ok(read) = stream.read(&mut chunk) else {
                return;
            };
            if read == 0 {
                return;
            }
            request.extend_from_slice(&chunk[..read]);
            let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n")
            else {
                continue;
            };
            let body_start = header_end + 4;
            let content_length = request[..body_start]
                .split(|byte| *byte == b'\n')
                .find_map(|line| {
                    let line = String::from_utf8_lossy(line);
                    line.strip_prefix("Content-Length:")
                        .or_else(|| line.strip_prefix("content-length:"))
                        .and_then(|value| value.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if request.len() >= body_start + content_length {
                return;
            }
        }
    }
}
