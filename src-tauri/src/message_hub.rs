use crate::s3_store::{self, S3Store};
use crate::AppConfig;

pub fn set_s3_config(
    endpoint: Option<&str>,
    bucket: Option<&str>,
    object_key: Option<&str>,
    access_key: Option<&str>,
    secret_key: Option<&str>,
) -> Result<AppConfig, String> {
    s3_store::set_s3_config(endpoint, bucket, object_key, access_key, secret_key)
}

pub fn test_connection(config: &AppConfig) -> Result<(), String> {
    S3Store::from_config(config)?.test_connection()
}

pub fn trial_config_for_s3_test(
    base: &AppConfig,
    endpoint: Option<&str>,
    bucket: Option<&str>,
    object_key: Option<&str>,
    access_key: Option<&str>,
    secret_key: Option<&str>,
) -> Result<AppConfig, String> {
    let mut trial = base.clone();
    if let Some(v) = endpoint {
        let t = v.trim();
        trial.s3_endpoint = if t.is_empty() {
            None
        } else {
            Some(s3_store::normalize_endpoint(t)?)
        };
    }
    if let Some(v) = bucket {
        let t = v.trim();
        trial.s3_bucket = if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        };
    }
    if let Some(v) = object_key {
        let t = v.trim();
        trial.s3_object_key = if t.is_empty() {
            None
        } else {
            Some(s3_store::normalize_object_key(t))
        };
    }
    if let Some(v) = access_key {
        let t = v.trim();
        trial.s3_access_key = if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        };
    }
    if let Some(v) = secret_key {
        let t = v.trim();
        trial.s3_secret_key = if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        };
    }
    Ok(trial)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn s3_test_configuration_normalizes_s3_fields() {
        let base = AppConfig::default();
        let trial = trial_config_for_s3_test(
            &base,
            Some("https://example.com/"),
            Some("bucket"),
            Some("/path/object.json"),
            Some("access"),
            Some("secret"),
        )
        .unwrap();

        assert_eq!(trial.s3_endpoint.as_deref(), Some("https://example.com"));
        assert_eq!(trial.s3_bucket.as_deref(), Some("bucket"));
        assert_eq!(trial.s3_object_key.as_deref(), Some("path/object.json"));
    }
}
