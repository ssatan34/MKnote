use md_sticky_note_lib::cloudimgs::{
    build_image_list_endpoint, build_upload_endpoint, normalize_directory, normalize_image_key,
    parse_directories_response, parse_upload_response, ACCESS_PASSWORD_HEADER, CLEANUP_PAGE_SIZE,
    UPLOAD_FIELD,
};

#[test]
fn cloudimgs_upload_contract_uses_current_api_field_and_header() {
    assert_eq!(UPLOAD_FIELD, "image");
    assert_eq!(ACCESS_PASSWORD_HEADER, "X-Access-Password");

    let endpoint = build_upload_endpoint("https://cloudimgs.example.test", "MDnote")
        .expect("valid CloudImgs endpoint");
    assert_eq!(
        endpoint,
        "https://cloudimgs.example.test/api/upload?dir=MDnote"
    );
}

#[test]
fn cloudimgs_directory_is_normalized_but_traversal_is_rejected() {
    assert_eq!(normalize_directory(" /MDnote/ ").unwrap(), "MDnote");
    assert_eq!(
        normalize_directory("MDnote/assets").unwrap(),
        "MDnote/assets"
    );
    assert!(normalize_directory("").is_err());
    assert!(normalize_directory("../other").is_err());
    assert!(normalize_directory("MDnote/../other").is_err());
}

#[test]
fn cloudimgs_cleanup_list_is_paged_and_image_keys_stay_relative() {
    let endpoint = build_image_list_endpoint("https://cloudimgs.example.test", "MDnote", 2)
        .expect("valid CloudImgs list endpoint");
    assert_eq!(
        endpoint,
        format!(
            "https://cloudimgs.example.test/api/images?dir=MDnote&page=2&pageSize={CLEANUP_PAGE_SIZE}"
        )
    );
    assert!(build_image_list_endpoint("https://cloudimgs.example.test", "MDnote", 0).is_err());
    assert_eq!(normalize_image_key("MDnote/example.png").unwrap(), "MDnote/example.png");
    assert!(normalize_image_key("../example.png").is_err());
    assert!(normalize_image_key("MDnote/../example.png").is_err());
}

#[test]
fn cloudimgs_directory_response_requires_the_configured_root_path() {
    let body = r#"{
        "success": true,
        "data": [
            {"name": "Other", "path": "Other"},
            {"name": "MDnote", "path": "MDnote"}
        ]
    }"#;

    parse_directories_response(body, "MDnote").expect("MDnote directory should be found");
    assert!(parse_directories_response(body, "Other/MDnote").is_err());
}

#[test]
fn cloudimgs_upload_response_prefers_full_url_and_resolves_relative_url() {
    let absolute_body = r#"{
        "success": true,
        "data": {
            "fullUrl": "https://cloudimgs.example.test/uploads/full.png",
            "url": "/uploads/relative.png"
        }
    }"#;
    assert_eq!(
        parse_upload_response("https://cloudimgs.example.test", absolute_body).unwrap(),
        "https://cloudimgs.example.test/uploads/full.png"
    );

    let relative_body = r#"{
        "success": true,
        "data": {"url": "/uploads/relative.png"}
    }"#;
    assert_eq!(
        parse_upload_response("https://cloudimgs.example.test", relative_body).unwrap(),
        "https://cloudimgs.example.test/uploads/relative.png"
    );
}

#[test]
fn cloudimgs_upload_response_surfaces_api_errors_without_fallback() {
    let body = r#"{"success": false, "error": "需要提供访问密码"}"#;
    let error = parse_upload_response("https://cloudimgs.example.test", body).unwrap_err();
    assert!(error.contains("需要提供访问密码"));
}
