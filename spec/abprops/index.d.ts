// AUTO-GENERATED — do not edit. Regenerated daily by wa-spec.
// WhatsApp Version: 2.3000.1055156383

// Wire type of a config value. The server always sends `configValue` as a
// string; the client decodes it with this type
// (WAWebABPropsParseConfigValue.parseConfigValue):
//   bool    → '1' | 'true' | 'True' are true, everything else false
//   int     → parseInt(value, 10)
//   float   → parseFloat(value)
//   string  → passed through unchanged
export type WaAbPropType = 'bool' | 'int' | 'float' | 'string'

export type WaAbPropValue = boolean | number | string

export interface WaAbProp {
    // Numeric id used on the wire and as the local abpropConfigs primary key.
    // Prop names never leave the client.
    readonly code: number
    readonly type: WaAbPropType
    // Value used when the server has not pushed one for this code.
    readonly defaultValue: WaAbPropValue
    // Substituted for defaultValue only on internal builds — gkx 26259 enabled
    // AND the account joined the internal beta. Usually identical to
    // defaultValue; where it differs it reveals the intended rollout target.
    readonly debugDefaultValue: WaAbPropValue
}

export declare const WA_ABPROPS: {
    readonly a2ui_fallback_show_timestamp: { readonly code: 40437; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly a2ui_supported_elements: { readonly code: 32276; readonly type: "string"; readonly defaultValue: "info_card, list_card, choices"; readonly debugDefaultValue: "info_card, list_card, choices" }
    readonly acp2_enabled: { readonly code: 36091; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly acp2_futureproof_enabled: { readonly code: 36197; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly acp2_group_chats_enabled: { readonly code: 36763; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly acp_removal: { readonly code: 25255; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly acs_graphql_issuance_projects: { readonly code: 40762; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly acs_use_graphql_for_forward_counter: { readonly code: 29218; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly acs_use_graphql_for_migration_test: { readonly code: 29217; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly acs_use_graphql_issuance: { readonly code: 27219; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly active_integrity_holdout_enabled: { readonly code: 39648; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly add_member_system_message: { readonly code: 4579; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly add_to_call_in_chat_thread: { readonly code: 11700; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly addon_infra_enable_perf_logging: { readonly code: 7567; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly admin_only_mention_everyone_group_size: { readonly code: 20354; readonly type: "int"; readonly defaultValue: 33; readonly debugDefaultValue: 33 }
    readonly adv_accept_hosted_devices: { readonly code: 6939; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly advanced_chat_privacy_content_update_july_25: { readonly code: 18025; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly after_read_fallback_duration: { readonly code: 26225; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly after_read_receiver_enabled: { readonly code: 25649; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly after_read_sending_enabled: { readonly code: 25648; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_3p_agent_chat_enabled: { readonly code: 31063; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_3p_agent_media_support_mode: { readonly code: 34393; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_3p_bot_product_chat_rendering_enabled: { readonly code: 34186; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_3p_bot_product_enabled: { readonly code: 33090; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_3p_bot_product_nux_notice_id: { readonly code: 34541; readonly type: "string"; readonly defaultValue: "20260806"; readonly debugDefaultValue: "20260806" }
    readonly ai_account_linking_enabled: { readonly code: 13856; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_all_languages_enabled: { readonly code: 16091; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_bizai_2way_integration_history_sync_pre_chatd_enabled: { readonly code: 26614; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_bot_group_soak_enabled: { readonly code: 37778; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_bot_integration_bot_profile: { readonly code: 25268; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ai_bot_integration_enabled: { readonly code: 25119; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_bot_integration_history_sync_enabled: { readonly code: 25269; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_bot_integration_history_sync_pre_chatd_enabled: { readonly code: 25469; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_action_logging_addition_enabled: { readonly code: 36304; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_meta_ai_banner_m2_enabled: { readonly code: 18784; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_chat_meta_ai_glasses_banner_enabled: { readonly code: 20405; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_chat_meta_ai_home_default_landing_enabled: { readonly code: 28033; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_meta_ai_home_web_enabled: { readonly code: 27817; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_meta_ai_null_state_web_enabled: { readonly code: 32817; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_thread_capability_enabled: { readonly code: 22038; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_threads_export_by_threads_enabled: { readonly code: 34081; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_threads_historical_messages_migration_enabled: { readonly code: 22070; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_threads_implicit_routing_strategy: { readonly code: 27519; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_chat_threads_infra_enabled: { readonly code: 20652; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_threads_pin_enabled: { readonly code: 25517; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_chat_threads_pin_max_count: { readonly code: 25520; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly ai_chat_threads_v1_deprecation_banner_max_impressions: { readonly code: 35038; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly ai_chat_threads_web_enabled: { readonly code: 23169; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_commentary_standalone_messages_enabled: { readonly code: 34670; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_content_inspection_url_enabled: { readonly code: 41999; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_contextual_writing_help_enabled: { readonly code: 22488; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_contextual_writing_help_languages_and_tones_config: { readonly code: 22797; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{\"en\": \"auto,professional,funny,supportive\"}" }
    readonly ai_contextual_writing_help_num_suggestions: { readonly code: 22759; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly ai_continuous_session_transparency_notice_enabled: { readonly code: 21510; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_dynamic_mode_selector_enabled: { readonly code: 25287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_dynamic_mode_selector_ttl_seconds: { readonly code: 25797; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly ai_experiment_graphql_config: { readonly code: 9601; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_fbid_db_migration_version_pre_chatd: { readonly code: 35760; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_fbid_migration_invoke_receive_enabled: { readonly code: 12795; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_fbid_migration_receive_enabled: { readonly code: 11660; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_file_upload_count_limit: { readonly code: 25093; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly ai_file_upload_size_limit_mb: { readonly code: 25524; readonly type: "int"; readonly defaultValue: 40; readonly debugDefaultValue: 40 }
    readonly ai_file_upload_supported_file_types: { readonly code: 25090; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ai_forward_attribution_enabled: { readonly code: 18286; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_forward_flow_surface_meta_ai_as_contact_enabled: { readonly code: 13879; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_genai_straw_hat: { readonly code: 28268; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_gizmo_integration_enabled: { readonly code: 28584; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_group_call_add_in_call_ahgc_enabled: { readonly code: 24654; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_call_add_in_call_lgc_enabled: { readonly code: 31717; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_call_max_version_by_country: { readonly code: 24656; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_group_call_max_version_by_platform: { readonly code: 24655; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_group_call_meta_ai_animation_version: { readonly code: 32245; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_group_call_start_call_ahgc_enabled: { readonly code: 31716; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_call_start_call_lgc_enabled: { readonly code: 31713; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_call_start_call_logging_enabled: { readonly code: 32527; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_call_start_call_notice_id: { readonly code: 31736; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ai_group_call_version: { readonly code: 24652; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_group_directed_send_agent_legs_enabled: { readonly code: 37855; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_muse_add_enabled: { readonly code: 43366; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_group_muse_enabled: { readonly code: 43108; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_group_muse_soak_enabled: { readonly code: 42753; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_group_participation_add_tee_enabled: { readonly code: 22236; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_participation_enabled: { readonly code: 22171; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_participation_send_enabled: { readonly code: 22184; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_send_mentioned_pushname_enabled: { readonly code: 24361; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_tasks_enabled: { readonly code: 35658; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_tee_history_share_enabled: { readonly code: 28278; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_group_tee_require_additional_member_enabled: { readonly code: 33050; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_groups_open_enabled: { readonly code: 22165; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_3p_bot_channel_enabled: { readonly code: 40686; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_3p_bot_enabled: { readonly code: 37639; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_3p_bot_group_add_companion_enabled: { readonly code: 37791; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_3p_bot_group_add_enabled: { readonly code: 37767; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_3p_bot_group_add_tee_removal_enabled: { readonly code: 37793; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_activity_enabled: { readonly code: 36263; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_approval_history_enabled: { readonly code: 40293; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_approval_notification_enabled: { readonly code: 36472; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_avatar_working_video_enabled: { readonly code: 39137; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_browser_enabled: { readonly code: 37854; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_chat_avatar_animated_collapse_enabled: { readonly code: 38651; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_commands_enabled: { readonly code: 27660; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_connectors_enabled: { readonly code: 37227; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_connectors_new_ui_enabled: { readonly code: 42591; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_connectors_supported_types: { readonly code: 38542; readonly type: "string"; readonly defaultValue: "oauth, consent_only"; readonly debugDefaultValue: "oauth, consent_only" }
    readonly ai_hatch_custom_connectors_enabled: { readonly code: 38808; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_cvm_activation_pairing_window_ttl: { readonly code: 42391; readonly type: "int"; readonly defaultValue: 43200; readonly debugDefaultValue: 43200 }
    readonly ai_hatch_cvm_enabled: { readonly code: 40134; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_cvm_pin_collection_on_companions_enabled: { readonly code: 41048; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_cvm_settings_enabled: { readonly code: 42286; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_data_controls_enabled: { readonly code: 37856; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_document_upload_size_limit_mb: { readonly code: 27873; readonly type: "int"; readonly defaultValue: 20; readonly debugDefaultValue: 20 }
    readonly ai_hatch_encrypted_media_enabled: { readonly code: 32496; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_fab_animation_variant: { readonly code: 38617; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly ai_hatch_fab_enabled: { readonly code: 38618; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_first_party_connectors_enabled: { readonly code: 38142; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_forwarding_html_enabled: { readonly code: 27876; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_group_history_share_enabled: { readonly code: 42143; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_gzip_encoding_enabled: { readonly code: 37777; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_hitl_approval_in_notification_enable: { readonly code: 41174; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_ideas_enabled: { readonly code: 37223; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_identity_enabled: { readonly code: 37588; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_in_app_activation_enabled: { readonly code: 39167; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_in_app_activation_flow_type: { readonly code: 40383; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_hatch_in_app_activation_with_subscription_enabled: { readonly code: 41923; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_in_app_additional_tokens_enabled: { readonly code: 40145; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_in_app_cvm_activation_enabled: { readonly code: 41522; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_in_app_subscriptions_enabled: { readonly code: 39115; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_integration_bot_profile: { readonly code: 26190; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ai_hatch_integration_enabled: { readonly code: 26189; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_integration_history_sync_enabled: { readonly code: 26517; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_integration_history_sync_pre_chatd_enabled: { readonly code: 26445; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_integration_tab_enabled: { readonly code: 27356; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_manage_subscription_enabled: { readonly code: 34521; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_manage_subscription_url: { readonly code: 34840; readonly type: "string"; readonly defaultValue: "https://www.whatsapp.com/"; readonly debugDefaultValue: "https://www.whatsapp.com/" }
    readonly ai_hatch_media_enabled: { readonly code: 37240; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_media_upload_count_limit: { readonly code: 27897; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly ai_hatch_mweb_signup_enabled: { readonly code: 37224; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_noise_teardown_interval_ms: { readonly code: 38514; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_hatch_options_card_enabled: { readonly code: 38676; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_peer_pairing_card_enabled: { readonly code: 40436; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_permission_enable: { readonly code: 39327; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_response_ux_parity_enabled: { readonly code: 38773; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_revoke_enabled: { readonly code: 36027; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_scheduled_tasks_enabled: { readonly code: 37857; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_secret_encrypted_message_enabled: { readonly code: 31040; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_secure_credentials_enabled: { readonly code: 37852; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_signup_trusted_hosts: { readonly code: 37222; readonly type: "string"; readonly defaultValue: "agent.meta.ai"; readonly debugDefaultValue: "agent.meta.ai" }
    readonly ai_hatch_space_enabled: { readonly code: 37054; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_space_public_in_app_enabled: { readonly code: 38441; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly ai_hatch_subscription_iac_kill_switch: { readonly code: 40534; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_subscription_ui_enabled: { readonly code: 37238; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_theme_colors_enabled: { readonly code: 39462; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_theme_enabled: { readonly code: 38652; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_upsell_in_agents_screen_enabled: { readonly code: 37476; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_upsell_in_agents_screen_variant: { readonly code: 37665; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_hatch_video_avatars_enabled: { readonly code: 31494; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_hatch_video_upload_enabled: { readonly code: 27470; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_vm_auth_enabled: { readonly code: 37983; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_vm_capability_sync_enabled: { readonly code: 39093; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_hatch_whatsapp_connector_enabled: { readonly code: 38409; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_home_bot_profile_sync_interval_sec: { readonly code: 11168; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly ai_html_viewer_forward_action_enabled: { readonly code: 37885; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_imagine_loading_indicator_enabled: { readonly code: 22795; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_learning_clear_chat_disable_empty_chats: { readonly code: 26745; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_maiba_wass_migration_receiving: { readonly code: 27083; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_maiba_wass_migration_sending: { readonly code: 27084; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_meta_ai_muse_chat_readonly_message_drop_variant: { readonly code: 39145; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_meta_ai_muse_default_assistant_variant: { readonly code: 38386; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_meta_ai_prekey_cleanup_enabled: { readonly code: 31941; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_meta_ai_thread_default_profile_pic_type: { readonly code: 38321; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_meta_ai_thread_inbox_filter_enabled: { readonly code: 36806; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_meta_ai_thread_profile_pic_badge_enabled: { readonly code: 38658; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_meta_ai_thread_rendering_enabled: { readonly code: 36759; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_meta_ai_thread_server_delete_enabled: { readonly code: 38125; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_meta_ai_thread_sync_enabled: { readonly code: 40234; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_metabot_document_ocr_image_conversion_enabled: { readonly code: 22301; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_metabot_document_upload_enabled: { readonly code: 17957; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ai_metabot_document_upload_page_count_limit: { readonly code: 19987; readonly type: "int"; readonly defaultValue: 100000; readonly debugDefaultValue: 100000 }
    readonly ai_metabot_document_upload_size_limit_mb: { readonly code: 19823; readonly type: "int"; readonly defaultValue: 40; readonly debugDefaultValue: 40 }
    readonly ai_metabot_image_input_languages: { readonly code: 9163; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: "en" }
    readonly ai_metabot_send_image_limit: { readonly code: 8685; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly ai_migrate_away_from_inline_tos_enabled: { readonly code: 18843; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_mode_selector_enabled: { readonly code: 23885; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_multimodal_all_languages_enabled: { readonly code: 37881; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_pdfn_nux_ai_group_muse_initiator_notice_id: { readonly code: 37762; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_pdfn_nux_ai_group_muse_member_notice_id: { readonly code: 43114; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ai_pdfn_nux_ai_group_muse_non_initiator_notice_id: { readonly code: 37763; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_pdfn_nux_ai_group_notice_id: { readonly code: 22298; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_pdfn_nux_ai_group_tee_discover_notice_id: { readonly code: 26171; readonly type: "string"; readonly defaultValue: "20260212"; readonly debugDefaultValue: "20260212" }
    readonly ai_pdfn_nux_ai_group_tee_notice_id: { readonly code: 22773; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_pdfn_nux_ai_side_chat_notice_id: { readonly code: 31542; readonly type: "string"; readonly defaultValue: " 20260211"; readonly debugDefaultValue: " 20260211" }
    readonly ai_pdfn_tos_inline_notices: { readonly code: 13970; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_pdfn_tos_invoke_notice_id: { readonly code: 9483; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_pdfn_tos_master_notice_id: { readonly code: 15295; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_pdfn_tos_non_blocking_notices: { readonly code: 15280; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ai_pdfn_tos_shortcut_notice_id: { readonly code: 9482; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly ai_ptt_main_gate_supported_languages: { readonly code: 9694; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: "en" }
    readonly ai_reminders_enabled: { readonly code: 9379; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_reminders_m1_enabled: { readonly code: 35746; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_reply_message_context_max_count: { readonly code: 22024; readonly type: "int"; readonly defaultValue: 20; readonly debugDefaultValue: 20 }
    readonly ai_reply_message_context_trigger_min_count: { readonly code: 22025; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly ai_retrigger_null_state_main_gate_v2_enabled: { readonly code: 14925; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rewrite_enabled: { readonly code: 14219; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rewrite_entry_point_min_words: { readonly code: 14923; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly ai_rewrite_in_expression_tray_enabled: { readonly code: 16510; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rewrite_languages_and_tones_config: { readonly code: 21139; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{\"en\": \"rephrase,professional,funny,supportive,proofread\"}" }
    readonly ai_rewrite_load_more_enabled: { readonly code: 20918; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rewrite_num_suggestions: { readonly code: 14924; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly ai_rewrite_stack_undo_enabled: { readonly code: 16943; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rewrite_supported_languages: { readonly code: 14220; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: "en" }
    readonly ai_rewrite_tone_modifiers: { readonly code: 14743; readonly type: "string"; readonly defaultValue: "rephrase,professional,funny,supportive"; readonly debugDefaultValue: "rephrase,professional,funny,supportive" }
    readonly ai_rich_response_content_types_logging_mode: { readonly code: 37056; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly ai_rich_response_forward_media_receiving_enabled: { readonly code: 21363; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_forward_media_sending_enabled: { readonly code: 20747; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_forward_receiving_enabled: { readonly code: 16682; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_rich_response_forward_sending_enabled: { readonly code: 16681; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_rich_response_forwarding_verification_enabled_v1: { readonly code: 19590; readonly type: "string"; readonly defaultValue: "\"none\""; readonly debugDefaultValue: "\"none\"" }
    readonly ai_rich_response_grid_image_enabled: { readonly code: 13578; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_inline_links_enabled: { readonly code: 23819; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_inline_media_side_by_side_survey_enabled: { readonly code: 42321; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_jarvis_forward_receiving_enabled: { readonly code: 39033; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_jarvis_forward_sending_enabled: { readonly code: 39027; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_jarvis_forward_verification_enabled: { readonly code: 39326; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_main_gate_enabled: { readonly code: 12539; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly ai_rich_response_post_citations_enabled: { readonly code: 22672; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_reasoning_enabled: { readonly code: 15589; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_remove_grouped_citations_count: { readonly code: 31010; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_side_by_side_survey_enabled: { readonly code: 17408; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_side_by_side_survey_skip_enabled: { readonly code: 42322; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_source_reporting_long_press_enabled: { readonly code: 38644; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_tee_forward_sending_enabled: { readonly code: 32683; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_tee_forwarding_verification_enforcement_v1: { readonly code: 32551; readonly type: "string"; readonly defaultValue: "none"; readonly debugDefaultValue: "none" }
    readonly ai_rich_response_unknown_sender_preview_enabled: { readonly code: 27355; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_unknown_sender_verification_masking_enabled: { readonly code: 27635; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_ur_media_grid_enabled: { readonly code: 18746; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_web_structured_response_enabled: { readonly code: 14141; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_rich_response_zeitgeist_carousel_enabled: { readonly code: 22750; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_search_ask_button_web_enabled: { readonly code: 30604; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_search_bar_2025_redesign_enabled: { readonly code: 16208; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_search_experience_enabled: { readonly code: 8025; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_search_experience_web_enabled: { readonly code: 18740; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_search_max_num_suggestions: { readonly code: 8076; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly ai_search_meta_ai_send_button_enabled: { readonly code: 20603; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly ai_search_null_state_convo_starter_gql_enabled: { readonly code: 36251; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_search_null_state_convo_starter_suggestions_update_interval: { readonly code: 17623; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly ai_search_null_state_enabled: { readonly code: 8026; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_search_null_state_row_count: { readonly code: 8407; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly ai_search_null_state_update_interval: { readonly code: 8100; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly ai_session_transparency_meta_ai_enabled: { readonly code: 23188; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_simplified_profile_page_enabled: { readonly code: 17104; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_standard_bot_profile_enabled: { readonly code: 32961; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_standard_bot_profile_group_enabled: { readonly code: 37766; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_subscription_enabled: { readonly code: 25927; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_subscription_imagine_intent_enabled: { readonly code: 28585; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_subscription_imagine_intent_metering_enabled: { readonly code: 33229; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_subscription_media_editor_enabled: { readonly code: 34784; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_subscription_metering_enabled: { readonly code: 30960; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_subscriptions_u18_age_gate_required: { readonly code: 37882; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_tab_unread_badge_recency_window_hours: { readonly code: 29800; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly ai_ugc_hide_enabled: { readonly code: 20041; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_ugc_not_an_expert_enabled: { readonly code: 17285; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_unified_response_forwarding_sender_web_timestamp: { readonly code: 32008; readonly type: "int"; readonly defaultValue: 1781582400; readonly debugDefaultValue: 1781582400 }
    readonly ai_unified_response_imagine_receiver_web_enabled: { readonly code: 24109; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_unified_response_mutation_enabled: { readonly code: 17805; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly ai_unified_response_qpl_logging: { readonly code: 24484; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_unified_response_receiver_web_enabled: { readonly code: 23348; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_unified_response_receiver_web_enabled_v2: { readonly code: 25929; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_unified_response_receiver_web_timestamp_v2: { readonly code: 25930; readonly type: "int"; readonly defaultValue: 1772082000; readonly debugDefaultValue: 1772082000 }
    readonly ai_unified_response_sender_web_enabled: { readonly code: 23347; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_unified_response_video_mutation_enabled: { readonly code: 36250; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_video_upload_size_limit_mb: { readonly code: 25523; readonly type: "int"; readonly defaultValue: 40; readonly debugDefaultValue: 40 }
    readonly ai_video_upload_support_languages: { readonly code: 28336; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ai_video_upload_web_enabled: { readonly code: 31107; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_voice_entry_point_logging_enabled: { readonly code: 13247; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_voice_multimodal_composer_enabled: { readonly code: 12692; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_web_ask_meta_ai_enabled: { readonly code: 23725; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_web_ask_meta_ai_improvement_enabled: { readonly code: 34586; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_web_ask_meta_ai_media_forward_enabled: { readonly code: 34257; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ai_web_forward_flow_enabled: { readonly code: 19676; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_web_meta_ai_image_input_enabled: { readonly code: 20522; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ai_web_meta_ai_pdf_document_input_enabled: { readonly code: 20581; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aigc_version: { readonly code: 23692; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly album_v2_forward_as_album_enabled: { readonly code: 10725; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly album_v2_min_items_to_send_album_with_caption: { readonly code: 12538; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly album_v2_min_items_to_send_as_album_enabled: { readonly code: 10848; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly album_v2_receiving_enabled: { readonly code: 8528; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly album_v2_sender_enabled: { readonly code: 8529; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly allow_backfill_with_v0_to_v1_primary_version_transition: { readonly code: 32186; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly android_inbox_mentions_replies_filter: { readonly code: 33633; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly android_instants_video_enabled: { readonly code: 42199; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly animated_emoji_final_set_enabled: { readonly code: 9757; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly animated_emoji_set_1_enabled: { readonly code: 9758; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly animated_emoji_use_lazy_parsing: { readonly code: 29140; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly animated_emojis_enabled: { readonly code: 3575; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly animated_race_mercedes_car_emoji_enabled: { readonly code: 13490; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly animated_soccer_ball_prod_enabled: { readonly code: 27751; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly animated_soccer_ball_test_enabled: { readonly code: 27750; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly anti_stripping_detection_enabled: { readonly code: 41651; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly anyone_can_link_to_groups: { readonly code: 13268; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly app_exit_reason_version: { readonly code: 8147; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly attach_invitee_user_pn_in_offer: { readonly code: 34040; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly attach_transport_rtx: { readonly code: 16201; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly audio_format_verification_enabled: { readonly code: 37944; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly audio_level_speaking_threshold: { readonly code: 1213; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 50 }
    readonly aura_app_themes_benefit_active: { readonly code: 23273; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_app_themes_enabled: { readonly code: 23274; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_custom_reactions_kill_switch: { readonly code: 36449; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_enabled: { readonly code: 23270; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_focus_lists_benefit_active: { readonly code: 32724; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_focus_lists_default_list_enabled: { readonly code: 34252; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_focus_lists_enabled: { readonly code: 32723; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_focus_lists_exclusion_enabled: { readonly code: 33928; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_focus_lists_kill_switch: { readonly code: 37611; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_focus_lists_schedule_enabled: { readonly code: 33413; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly aura_focus_lists_setup_enabled: { readonly code: 35805; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_group_reactions_blocking_enabled: { readonly code: 33522; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_group_reactions_editor_enabled: { readonly code: 39086; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_group_reactions_server_field_enabled: { readonly code: 42442; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_kill_switch: { readonly code: 28345; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_live_read_receipts_enabled: { readonly code: 39620; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_media_offload_benefit_active: { readonly code: 29308; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_media_offload_enabled: { readonly code: 29391; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_native_benefit_previews_bottom_button_variant: { readonly code: 42578; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly aura_native_benefit_previews_effects_enabled: { readonly code: 38905; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_native_benefit_previews_enabled: { readonly code: 35532; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_native_onboarding_enabled: { readonly code: 39481; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_image_quality: { readonly code: 40592; readonly type: "int"; readonly defaultValue: 95; readonly debugDefaultValue: 95 }
    readonly aura_original_quality_media_benefit_active: { readonly code: 36425; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_media_enabled: { readonly code: 36424; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_media_kill_switch: { readonly code: 40965; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_media_menu_enabled: { readonly code: 39787; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_media_share_extension_enabled: { readonly code: 42234; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_media_share_send_enabled: { readonly code: 42323; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_media_tooltips_enabled: { readonly code: 42021; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_original_quality_video_tuning: { readonly code: 39775; readonly type: "string"; readonly defaultValue: "{\"size_limit_mb\":180,\"max_edge\":3840,\"max_frame_rate\":240,\"size_limit_fraction\":0.95}"; readonly debugDefaultValue: "{\"size_limit_mb\":180,\"max_edge\":3840,\"max_frame_rate\":240,\"size_limit_fraction\":0.95}" }
    readonly aura_pinned_chats_benefit_active: { readonly code: 23278; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_pinned_chats_enabled: { readonly code: 23277; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_pinned_chats_hidden_pins_fix_enabled: { readonly code: 42239; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_pinned_chats_targeted_nux_force: { readonly code: 27135; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_pinned_chats_trim_requires_synced_benefits_enabled: { readonly code: 42240; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_premium_sticker_freemium_allowance: { readonly code: 39046; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly aura_premium_sticker_freemium_enabled: { readonly code: 40194; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_premium_sticker_freemium_reset_days: { readonly code: 42273; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly aura_premium_sticker_regular_sheet_enabled: { readonly code: 40291; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_premium_stickers_killswitch: { readonly code: 27946; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_profile_badge_enabled: { readonly code: 39543; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_profile_name_badge_benefit_active: { readonly code: 41216; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_profile_name_badge_enabled: { readonly code: 41126; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_profile_name_badge_force_for_all: { readonly code: 41127; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_profile_name_badge_kill_switch: { readonly code: 41753; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_profile_name_badge_testing_about: { readonly code: 42296; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_ringtones_benefit_active: { readonly code: 24050; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_ringtones_enabled: { readonly code: 24047; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_settings_row_enabled: { readonly code: 27210; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_static_benefit_rows_enabled: { readonly code: 42703; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_status_search_enabled: { readonly code: 26346; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_status_search_max_viewers: { readonly code: 26545; readonly type: "int"; readonly defaultValue: 1000; readonly debugDefaultValue: 1000 }
    readonly aura_status_search_timeout_threshold: { readonly code: 26546; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly aura_stickers_benefit_active: { readonly code: 24801; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_stickers_enabled: { readonly code: 24800; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_stickers_overlay_animation_enabled: { readonly code: 25210; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_stickers_preview_max_animation_count: { readonly code: 26602; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly aura_stickers_qp_banner_upsell_sheet_enabled: { readonly code: 33209; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_stickers_suggestions_enabled: { readonly code: 37137; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_stickers_suggestions_overlay_enabled: { readonly code: 37370; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_stickers_suggestions_weight: { readonly code: 37398; readonly type: "float"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly aura_subscription_simulation_enabled: { readonly code: 26086; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly aura_upsell_generic_headline_enabled: { readonly code: 39461; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly auth_agents_consumer_exp_enabled: { readonly code: 26492; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly auth_agents_consumer_offboarding_exp_enabled: { readonly code: 30360; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly auth_reps_consumer_ai_group_block_enabled: { readonly code: 36453; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly av1_video_dual_upload_chat_bitrate_multiplier: { readonly code: 40787; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly backfill_check_primary_identity_key: { readonly code: 33448; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly backfill_supports_coex_companion: { readonly code: 27975; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly banned_shops_ux_enabled: { readonly code: 957; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_1: { readonly code: 32208; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_10: { readonly code: 32217; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_2: { readonly code: 32209; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_3: { readonly code: 32210; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_4: { readonly code: 32211; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_5: { readonly code: 32212; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_6: { readonly code: 32213; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_7: { readonly code: 32214; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_8: { readonly code: 32215; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_9: { readonly code: 32216; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_v1: { readonly code: 32373; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_banner_v2: { readonly code: 32374; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_1: { readonly code: 31965; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_10: { readonly code: 31966; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_2: { readonly code: 31961; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_3: { readonly code: 31960; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_4: { readonly code: 31964; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_5: { readonly code: 31962; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_6: { readonly code: 31967; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_7: { readonly code: 31969; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_8: { readonly code: 31963; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bb_chat_list_mab_9: { readonly code: 31968; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly big_screen_drag_and_drop_chat_improvements_enabled: { readonly code: 40348; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_agent_3p_store_links_enabled: { readonly code: 24114; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly biz_ai_agent_ai_editing_enabled: { readonly code: 34595; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_agent_ai_editing_experiment: { readonly code: 35468; readonly type: "string"; readonly defaultValue: "NONE"; readonly debugDefaultValue: "NONE" }
    readonly biz_ai_agent_ai_editing_secretless_send_enabled: { readonly code: 35457; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_agent_chat_a2ui_enabled: { readonly code: 40303; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_agent_chat_media_upload_count_limit: { readonly code: 40162; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly biz_ai_agent_demo_mode_v2_enabled: { readonly code: 37865; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_agent_thread_status_history_sync_enabled: { readonly code: 20099; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_auto_save_enabled: { readonly code: 13464; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_coaching_enabled: { readonly code: 13465; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_consumer_tos_notice_iq_web: { readonly code: 24754; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_consumer_tos_update_web: { readonly code: 23880; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_enable_download: { readonly code: 35593; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_fab_confirm_modal_enabled: { readonly code: 32846; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_fab_enabled: { readonly code: 33531; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_handoff_timing_sync_enabled: { readonly code: 33602; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_in_thread_unmute_v2: { readonly code: 15523; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_large_screens_gate_fetch_enabled: { readonly code: 31880; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_meta_one_integration: { readonly code: 31231; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_priority_list_enabled: { readonly code: 16420; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_priority_list_item_expire_days: { readonly code: 16472; readonly type: "int"; readonly defaultValue: 14; readonly debugDefaultValue: 1 }
    readonly biz_ai_responding_list_enabled: { readonly code: 26670; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_response_settings_ui_experiment: { readonly code: 29706; readonly type: "string"; readonly defaultValue: "NONE"; readonly debugDefaultValue: "NONE" }
    readonly biz_ai_smb_agents_automatic_reply_enabled: { readonly code: 8505; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_suggested_reply_auto_fetch_limit_enabled: { readonly code: 35651; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_suggested_reply_coaching_enabled: { readonly code: 34282; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_suggested_reply_prefetch_enabled: { readonly code: 35538; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_tools_settings: { readonly code: 28552; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_tools_sync: { readonly code: 29383; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_tos_variant: { readonly code: 20833; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly biz_ai_upr_countries: { readonly code: 37272; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "ID" }
    readonly biz_ai_upr_id_enabled: { readonly code: 36878; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_upr_indonesia_enabled: { readonly code: 36868; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_upr_mx_enabled: { readonly code: 39332; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_web_ai_hub_chat_nav_enabled: { readonly code: 34204; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_ai_hub_tap_cta_show_alert: { readonly code: 17093; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_appointments_enabled: { readonly code: 36222; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_bulk_thread_control_enabled: { readonly code: 32588; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_checkout_enabled: { readonly code: 42503; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_gdrive_enabled: { readonly code: 32906; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_hub_chat_enabled: { readonly code: 34203; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_integration_hub_enabled: { readonly code: 33956; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_onboarding_handoff: { readonly code: 29298; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly biz_ai_web_onboarding_notification_dispatch_enabled: { readonly code: 35223; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_ai_web_sc_failure_cache_enabled: { readonly code: 42168; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly biz_ai_web_smart_composer_enabled: { readonly code: 34003; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_integrity_query_lid_enabled: { readonly code: 43301; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly biz_message_tap_logging_enabled: { readonly code: 41059; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_message_tap_logging_unstructured_enabled: { readonly code: 41114; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_vpv_coverage_logging_enabled: { readonly code: 41210; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_vpv_dimensions_logging_enabled: { readonly code: 30266; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly biz_vpv_impression_logging_enabled: { readonly code: 25465; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bizai_smb_mx_m2_upsell: { readonly code: 36187; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly blocklist_system_msg_on_full_refetch: { readonly code: 28070; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bloks_a2ui_steps_enabled: { readonly code: 32251; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly blue_education_enabled: { readonly code: 5295; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly blue_education_v2_enabled: { readonly code: 6127; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly blue_enabled: { readonly code: 5276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly blue_profile_locked_ui_enabled: { readonly code: 6337; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly blue_strings_enabled: { readonly code: 5846; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bonsai_avatar_enabled: { readonly code: 4532; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bonsai_carousel_enabled: { readonly code: 5283; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bonsai_carousel_hq_thumbnail_enabled: { readonly code: 6459; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bonsai_carousel_reels_profile_photo_enabled: { readonly code: 6458; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bonsai_chat_list_entry_point_enabled: { readonly code: 6251; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bonsai_enabled: { readonly code: 4010; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bonsai_english_only: { readonly code: 5637; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bonsai_fp_ugc_sender: { readonly code: 9541; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bonsai_meta_ai_shortcut_tos_enabled: { readonly code: 8004; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bonsai_ptt_enabled: { readonly code: 4416; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bonsai_supported_languages: { readonly code: 7848; readonly type: "string"; readonly defaultValue: "en"; readonly debugDefaultValue: "en" }
    readonly bonsai_ti_timeout_duration_ms: { readonly code: 4736; readonly type: "int"; readonly defaultValue: 10000; readonly debugDefaultValue: 10000 }
    readonly bonsai_update_interval: { readonly code: 4417; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly bonsai_word_streaming_enabled: { readonly code: 4974; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly booking_confirmation_enabled_wa_web: { readonly code: 23559; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bot_3p_status: { readonly code: 5985; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly bot_profile_sync_migration_enabled: { readonly code: 17485; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_api_offers_text_detection_cta_enabled: { readonly code: 40429; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_consumer_delete_payment_info_web_enabled: { readonly code: 34062; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_consumer_payments_web_enabled: { readonly code: 36339; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_consumer_pix_contact_info_web_enabled: { readonly code: 34555; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_consumer_pix_sync_receive_enabled: { readonly code: 33219; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_consumer_pix_sync_receive_web_enabled: { readonly code: 33244; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_consumer_promotions_in_purchase_hub_enabled: { readonly code: 40911; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_consumer_promotions_in_purchase_hub_variant: { readonly code: 41803; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly br_enable_payment_logos_on_bubble: { readonly code: 8160; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_p2m_payments_deep_link: { readonly code: 40251; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_payments_add_pix_key_deeplink_allowlist: { readonly code: 35683; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly br_payments_add_pix_key_deeplink_enabled: { readonly code: 35682; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly br_payments_add_pix_key_message_enabled: { readonly code: 37076; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly br_payments_enhanced_text_message_cta_logging_fix: { readonly code: 36049; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly br_payments_home_duration_rule_for_pux_banner: { readonly code: 22249; readonly type: "int"; readonly defaultValue: 604800; readonly debugDefaultValue: 604800 }
    readonly br_payments_multiple_pix_codes_in_message_detection_enabled: { readonly code: 41066; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_payments_multiple_pix_keys_enabled: { readonly code: 32752; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_payments_options_to_pay_sheet_enabled: { readonly code: 35784; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly br_payments_payment_detection_enhancement: { readonly code: 27309; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_payments_payment_method_weights: { readonly code: 38135; readonly type: "string"; readonly defaultValue: " {\"version\":\"default\"}"; readonly debugDefaultValue: " {\"version\":\"v1\",\"signals\":{\"pix_native_connected\":300,\"appswitch_returning\":200,\"last_used\":100}}" }
    readonly br_payments_payment_request_cta: { readonly code: 25599; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_payments_pix_groups_enabled: { readonly code: 21741; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_payments_pix_save_logging_source_enabled: { readonly code: 39455; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly br_pix_key_bubble_content_update: { readonly code: 26033; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_smb_payments_insights_enabled: { readonly code: 41599; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_smb_paymentshome_enabled: { readonly code: 23042; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly br_smb_pix_payment_request_variant: { readonly code: 24388; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly brigading_privacy_setting_enabled: { readonly code: 9876; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly broadcast_to_your_followers_enabled: { readonly code: 31580; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bug_reporting_abprops_uploaded_on_submissoin: { readonly code: 24850; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bug_reporting_async_attachments_enabled: { readonly code: 23978; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bug_reporting_attach_pathfinder_pre_bug_creation: { readonly code: 26311; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: false }
    readonly bug_reporting_attach_view_dump_pre_bug_creation: { readonly code: 26307; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly bug_reporting_pre_uploaded_attachments_on_bug_creation_enabled: { readonly code: 24422; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bug_reporting_request_call_peer_log: { readonly code: 36539; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly bug_reporting_rid_in_flytrap: { readonly code: 24421; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly bug_reporting_using_graphql: { readonly code: 24161; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly business_broadcast_campaign_syncd_enabled: { readonly code: 26426; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly business_broadcast_insights_campaign_ttl_days: { readonly code: 27218; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly business_broadcast_insights_sync_past_x_days: { readonly code: 27082; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly business_broadcast_mv_credits_expired_days: { readonly code: 42715; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly business_broadcasts_syncd_wam_logging: { readonly code: 28277; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly business_tool_enhanced_logging: { readonly code: 4427; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly buyer_initiated_order_request_variant_enabled: { readonly code: 5114; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly call_admin_version: { readonly code: 2912; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly call_info_optimizations_1on1: { readonly code: 31095; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly call_info_optimizations_1on1_context_menu: { readonly code: 34450; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly call_info_optimizations_ahgc_call_link: { readonly code: 31096; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly call_info_optimizations_lgc: { readonly code: 31094; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly call_info_optimizations_version: { readonly code: 27483; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly call_offer_failed_soft_landing_screen_version: { readonly code: 10559; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly call_screen_share_dual_stream_app_update_dialog_enabled: { readonly code: 31922; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly call_screening_callee_version: { readonly code: 37337; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly call_screening_caller_version: { readonly code: 37323; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly call_screening_setting_data_version: { readonly code: 37934; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly call_screening_voicemail_beep_tone: { readonly code: 34940; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly call_setup_definition_fix: { readonly code: 40735; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly call_spam_prompt_logging_enabled: { readonly code: 42406; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly call_spam_prompt_session_id_enabled: { readonly code: 42407; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly callee_accept_timeout_ms: { readonly code: 6007; readonly type: "int"; readonly defaultValue: 30000; readonly debugDefaultValue: 30000 }
    readonly calling_32p_version: { readonly code: 7709; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 3 }
    readonly calling_abprop_bucket_codes: { readonly code: 40587; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly calling_audio_share_version: { readonly code: 6598; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_av_sync_webrtc: { readonly code: 24599; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly calling_dual_stream_camera_auto_off_battery_threshold_pct: { readonly code: 33552; readonly type: "int"; readonly defaultValue: 15; readonly debugDefaultValue: 15 }
    readonly calling_dual_stream_camera_auto_off_enabled: { readonly code: 32896; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly calling_dual_stream_camera_auto_off_include_low_data_usage: { readonly code: 33235; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly calling_dual_stream_camera_auto_off_poor_network_time_ms: { readonly code: 33548; readonly type: "int"; readonly defaultValue: 5800; readonly debugDefaultValue: 5800 }
    readonly calling_enable_dual_stream_receiver: { readonly code: 34740; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly calling_exp_target_sample_ss: { readonly code: 36094; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly calling_lid_version: { readonly code: 3358; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_rust_migration_bitmap: { readonly code: 17954; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_rust_migration_incoming_ack_stanza_bitmap: { readonly code: 28434; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_rust_migration_incoming_stanza_bitmap: { readonly code: 26876; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_rust_migration_scope1_bitmap: { readonly code: 38516; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_screen_share_milestone_version: { readonly code: 30350; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly calling_ux_logging_bitmap: { readonly code: 8175; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_voicemail_attached_icce_enabled: { readonly code: 30383; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly calling_voicemail_enabled: { readonly code: 17685; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly calling_voicemail_quoted_replies_enabled: { readonly code: 30165; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly calls_tab_username_global_search_enabled: { readonly code: 17698; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly canonical_ent_companion_server_cached_nonce_enabled: { readonly code: 28399; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly cap_context_info_max_array_length: { readonly code: 33504; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly capi_messaging_pairs_client_enabled: { readonly code: 38129; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly capi_messaging_pairs_vpv_enabled: { readonly code: 38364; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly carousel_message_client_enabled: { readonly code: 4668; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly catalog_categories_enabled: { readonly code: 1514; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly cci_compliance_ctwa: { readonly code: 24983; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly cci_compliance_ctwa_learn_more_hyperlink: { readonly code: 25366; readonly type: "string"; readonly defaultValue: "https://faq.whatsapp.com/785493319976156/"; readonly debugDefaultValue: "https://faq.whatsapp.com/785493319976156/" }
    readonly cci_compliance_mm: { readonly code: 24853; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_album_v2_receiving_enabled: { readonly code: 13219; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_album_v2_sender_enabled: { readonly code: 13220; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_chats_list_dim_muted_enabled: { readonly code: 41077; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_enforcement_logging_enabled: { readonly code: 20549; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_enforcement_policy_education_enabled: { readonly code: 23745; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_forward_bottom_button_enabled: { readonly code: 9422; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_forward_to_chat_enabled: { readonly code: 4338; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_forward_to_chat_v2_message_navigation_enabled: { readonly code: 4682; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_osa_reporting_enabled: { readonly code: 12987; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_photo_poll_receiver_enabled: { readonly code: 11980; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_photo_poll_sender_enabled: { readonly code: 11989; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_playable_message_views_duration_milliseconds: { readonly code: 4722; readonly type: "int"; readonly defaultValue: 3000; readonly debugDefaultValue: 3000 }
    readonly channel_poll_forwarding_enabled: { readonly code: 10412; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_post_interaction_logging_enabled: { readonly code: 31879; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_ptt_status_card_enabled: { readonly code: 10513; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_pull_message_updates_threshold_seconds: { readonly code: 4326; readonly type: "int"; readonly defaultValue: 120; readonly debugDefaultValue: 120 }
    readonly channel_reactions_enabled: { readonly code: 4306; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_reactions_sender_list_enabled: { readonly code: 5185; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly channel_reactions_settings_enabled: { readonly code: 4887; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_status_admin_insights_enabled: { readonly code: 37381; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_status_consumption: { readonly code: 23995; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_status_consumption_music_enabled: { readonly code: 26774; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_status_creation: { readonly code: 23994; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_status_creation_profile_ring_enabled: { readonly code: 33840; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_status_deeplink_enabled: { readonly code: 28500; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly channel_status_fill_gap_page_size: { readonly code: 27777; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly channel_status_forwarding_enabled: { readonly code: 28479; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_status_help_enabled: { readonly code: 30999; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_status_resharing_enabled: { readonly code: 30155; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_supported_message_types: { readonly code: 3919; readonly type: "string"; readonly defaultValue: "1, 2, 3, 5, 9, 10, 12, 15"; readonly debugDefaultValue: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15" }
    readonly channel_to_channel_forwarding_logging_enabled: { readonly code: 8227; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_us_ncii_reporting_enabled: { readonly code: 25818; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channel_view_counts_enabled: { readonly code: 4721; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 3 }
    readonly channel_views_duration_milliseconds: { readonly code: 4648; readonly type: "int"; readonly defaultValue: 250; readonly debugDefaultValue: 250 }
    readonly channel_views_vpv_definition_enabled: { readonly code: 23616; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channel_web_embedding_enabled: { readonly code: 31664; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_insights_gizmos_enabled: { readonly code: 9641; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_notifications_enabled: { readonly code: 18560; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_notifications_forwards_enabled: { readonly code: 32808; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_profiles_banner_enabled: { readonly code: 33896; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_profiles_forwarding_to_chats_enabled: { readonly code: 23170; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_profiles_id_only_resolution_enabled: { readonly code: 34768; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_profiles_list_enabled: { readonly code: 23174; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_profiles_receiver_enabled: { readonly code: 22318; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_admin_profiles_sender_enabled: { readonly code: 22316; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_admin_profiles_settings_enabled: { readonly code: 24347; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_profiles_update_enabled: { readonly code: 23168; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_reply_enabled: { readonly code: 7211; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_admin_reply_receiver_enabled: { readonly code: 7237; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_ai_at_enabled: { readonly code: 35799; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_album_receiver_enabled: { readonly code: 23809; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_album_sender_enabled: { readonly code: 23859; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_albums_v2_forwarding_to_status_enabled: { readonly code: 24488; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_audio_files_display_waveform_enabled: { readonly code: 6996; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_audio_files_receiver_enabled: { readonly code: 6506; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_audio_files_sender_enabled: { readonly code: 6505; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_audio_files_sender_waveform_enabled: { readonly code: 6943; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_capabilities_enabled: { readonly code: 10328; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly channels_context_card_invite_followers_enabled: { readonly code: 27449; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_creation_enabled: { readonly code: 3878; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 2 }
    readonly channels_creation_entrypoint_in_directory_enabled: { readonly code: 18613; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly channels_creation_entrypoint_in_updates_tab_enabled: { readonly code: 18925; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly channels_directory_categories_cache_refresh_interval_ms: { readonly code: 8151; readonly type: "int"; readonly defaultValue: 86400000; readonly debugDefaultValue: 600000 }
    readonly channels_directory_categories_enabled: { readonly code: 7685; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_directory_categories_logging_enabled: { readonly code: 10188; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_directory_category_types: { readonly code: 7734; readonly type: "string"; readonly defaultValue: "3,7,6,4,1,5,2"; readonly debugDefaultValue: "3,7,6,4,1,5,2" }
    readonly channels_directory_enabled: { readonly code: 3879; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 2 }
    readonly channels_directory_flat_categories_list_enabled: { readonly code: 37126; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_directory_page_size: { readonly code: 5853; readonly type: "int"; readonly defaultValue: 50; readonly debugDefaultValue: 50 }
    readonly channels_directory_search_debounce_ms: { readonly code: 5204; readonly type: "int"; readonly defaultValue: 250; readonly debugDefaultValue: 250 }
    readonly channels_directory_v2_cache_refresh_interval_ms: { readonly code: 5304; readonly type: "int"; readonly defaultValue: 1800000; readonly debugDefaultValue: 600000 }
    readonly channels_directory_v2_filter_types: { readonly code: 5127; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "1, 2, 3, 4, 5, 6" }
    readonly channels_emoji_forwarded_attribution_ui_enabled: { readonly code: 17081; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_enabled: { readonly code: 3877; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 2 }
    readonly channels_fetch_and_log_capabilities: { readonly code: 10325; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly channels_filter_out_subscribed_in_directory_null_state: { readonly code: 5015; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_follower_invite_creation_modal_enabled: { readonly code: 26120; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_followers_list_cache_refresh_milliseconds: { readonly code: 5217; readonly type: "int"; readonly defaultValue: 60000; readonly debugDefaultValue: 60000 }
    readonly channels_forward_counter_on_status_card_enabled: { readonly code: 26148; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_forward_logging_v2_enabled: { readonly code: 5492; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_forward_to_my_status_web_enabled: { readonly code: 43192; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_hide_news_url_preview: { readonly code: 5287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_in_app_policy_detail_enabled: { readonly code: 29132; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_invite_contacts_to_follow_consumer_enabled: { readonly code: 16790; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_invite_contacts_to_follow_producer_enabled: { readonly code: 16789; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_invite_contacts_to_follow_receiver_invalid_message_drop_endabled: { readonly code: 22280; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly channels_invite_contacts_to_follow_receiver_logging_enabled: { readonly code: 20836; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_invite_contacts_to_follow_sender_logging_enabled: { readonly code: 20837; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_invite_link_preview_improvement_enabled: { readonly code: 22196; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_invite_link_preview_reliability_enabled: { readonly code: 37302; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_is_multi_admin_lid_migration_enabled: { readonly code: 16193; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_max_messages_batch_pull: { readonly code: 5494; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly channels_message_pin_admin_enabled: { readonly code: 29516; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_message_pin_follower_enabled: { readonly code: 29517; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_migration_banner_hca_link_is_visible: { readonly code: 38695; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_multi_admin_max_admin_count: { readonly code: 6461; readonly type: "int"; readonly defaultValue: 16; readonly debugDefaultValue: 16 }
    readonly channels_music_forwarding_disabled: { readonly code: 22089; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_music_receiver_enabled: { readonly code: 20266; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_open_qpl_improvements_enabled: { readonly code: 15754; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_open_qpl_user_rid_logging_enabled: { readonly code: 17712; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_photo_polls_genai_enabled: { readonly code: 26392; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_pinning_nudge_enabled: { readonly code: 20551; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_poll_receive_enabled: { readonly code: 6191; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_poll_voter_list_enabled: { readonly code: 6382; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_poll_voters_details_cache_ttl_ms: { readonly code: 7920; readonly type: "int"; readonly defaultValue: 300000; readonly debugDefaultValue: 300000 }
    readonly channels_poll_voters_summary_cache_ttl_ms: { readonly code: 7919; readonly type: "int"; readonly defaultValue: 120000; readonly debugDefaultValue: 120000 }
    readonly channels_post_status_card_web_enabled: { readonly code: 42263; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_post_status_video_card_web_enabled: { readonly code: 42627; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_proactive_message_gap_handling_enabled: { readonly code: 5871; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_producer_insights_enabled: { readonly code: 8960; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_producer_insights_hide_deltas: { readonly code: 9792; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly channels_producer_insights_min_followers: { readonly code: 9447; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly channels_ptt_logging_enabled: { readonly code: 6274; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly channels_ptt_receiver_enabled: { readonly code: 5876; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_ptv_forwarding_enabled: { readonly code: 13776; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_ptv_forwarding_to_status_enabled: { readonly code: 13777; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_ptv_receiving_enabled: { readonly code: 13559; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_qpl_improvements_supported_types: { readonly code: 19589; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_qpl_logging: { readonly code: 7677; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_question_admin_enabled: { readonly code: 17426; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_question_admin_m2_enabled: { readonly code: 26910; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_question_admin_starring_enabled: { readonly code: 36006; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_question_fetch_responses_page_size: { readonly code: 18984; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly channels_question_follower_m2_enabled: { readonly code: 26911; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_question_forward_message_types_chat_m1_enabled: { readonly code: 18988; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "22" }
    readonly channels_question_forward_message_types_chat_m2_enabled: { readonly code: 26925; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_question_forward_message_types_status_m2_enabled: { readonly code: 26926; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_question_receiver_message_types_m1_enabled: { readonly code: 15246; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: " 22" }
    readonly channels_question_receiver_message_types_m2_enabled: { readonly code: 26932; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_question_reply_receiver_message_types_m1_enabled: { readonly code: 18393; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "25" }
    readonly channels_question_reply_receiver_message_types_m2_enabled: { readonly code: 26933; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_question_reply_sender_message_types_m1_enabled: { readonly code: 18394; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "22" }
    readonly channels_question_reply_sender_message_types_m2_enabled: { readonly code: 26931; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_question_response_like_admin_enabled: { readonly code: 36380; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_question_response_like_follower_enabled: { readonly code: 36381; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_question_response_rate_limit_max_count_in_client_ui: { readonly code: 19989; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly channels_question_sender_message_types_m1_enabled: { readonly code: 15418; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly channels_question_sender_message_types_m2_enabled: { readonly code: 26930; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_question_view_your_responses_enabled: { readonly code: 36379; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_questions_integrity_m1_enabled: { readonly code: 17600; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_questions_replies_adjusted_layout_enabled: { readonly code: 42209; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_questions_responses_drawer_loading_shimmer_enabled: { readonly code: 29209; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_questions_search_backtest_enabled: { readonly code: 31046; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_questions_search_enabled: { readonly code: 24004; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_quick_forwarding_button_mode: { readonly code: 7234; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly channels_quick_share_to_status_ui_enabled: { readonly code: 40962; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_quiz_option_reshuffle_enabled: { readonly code: 35752; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_quiz_option_reshuffle_enabled_no_exposure: { readonly code: 36956; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_quiz_option_reshuffle_notice_enabled: { readonly code: 35906; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_quiz_receiving_enabled: { readonly code: 19778; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_quiz_sending_enabled: { readonly code: 19777; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_reactions_bottomsheet_tap_to_react_enabled: { readonly code: 7682; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_recommendation_unit_removal_v1_enabled: { readonly code: 33761; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_recommended_v3_ui_limit: { readonly code: 8167; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly channels_reply_forward_message_types_chat_m1_enabled: { readonly code: 19053; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "25" }
    readonly channels_reply_forward_message_types_chat_m2_enabled: { readonly code: 26927; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_reply_forward_message_types_status_m2_enabled: { readonly code: 26924; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly channels_scheduling_updates_enabled: { readonly code: 33897; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_scheduling_updates_message_types: { readonly code: 33898; readonly type: "string"; readonly defaultValue: "1"; readonly debugDefaultValue: "1" }
    readonly channels_scheduling_updates_receiver_enabled: { readonly code: 35422; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_scheduling_updates_window_duration_max_seconds: { readonly code: 35492; readonly type: "int"; readonly defaultValue: 2592000; readonly debugDefaultValue: 2592000 }
    readonly channels_scheduling_updates_window_duration_min_seconds: { readonly code: 35491; readonly type: "int"; readonly defaultValue: 600; readonly debugDefaultValue: 600 }
    readonly channels_send_album_enabled: { readonly code: 5643; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_send_view_receipt_enabled: { readonly code: 4760; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_sgi_receiver_enabled: { readonly code: 32801; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_sgi_sender_enabled: { readonly code: 32802; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_sgi_sender_self_disclosure_enabled: { readonly code: 32990; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_sgi_ui_label_enabled: { readonly code: 33109; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_share_link_logging_enabled: { readonly code: 5491; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_status_consumption_entrypoints: { readonly code: 27240; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 3 }
    readonly channels_status_updates_consumption_enabled: { readonly code: 6444; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_sticker_forwarded_attribution_ui_enabled: { readonly code: 16856; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_sticker_pack_forwarded_attribution_ui_enabled: { readonly code: 16858; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_sticker_pack_rendering: { readonly code: 20182; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_t_enabled: { readonly code: 25078; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_uk_osa_enabled: { readonly code: 14249; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_updates_tab_swipe_actions_enabled: { readonly code: 8653; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_verified_badge_in_compact_inbox_enabled: { readonly code: 8059; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_video_play_logging_enabled: { readonly code: 16491; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly channels_view_counts_sender_admin_exclusion_mode: { readonly code: 31729; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly channels_view_counts_vpv_logging_enabled: { readonly code: 12295; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_visibility_logging_fullscreen_media_enabled: { readonly code: 28148; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly channels_vpv_logging_enabled: { readonly code: 9834; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly chat_interactive_preview_enabled: { readonly code: 37775; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly chat_psa_normal_blocklist_enabled: { readonly code: 40159; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly chat_vsr_model: { readonly code: 39803; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly chatlist_filters_v1: { readonly code: 1608; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly chatlist_prevent_autoread: { readonly code: 21156; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly chatlist_show_draft_for_empty_chat: { readonly code: 19287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly cloud_api_calling_alpha_ui_enabled: { readonly code: 4067; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 2 }
    readonly coex_business_broadcast_enabled: { readonly code: 20480; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly coex_calling_enabled: { readonly code: 18047; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly coex_calling_enabled_business: { readonly code: 23933; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly coex_calling_permissions_3p_enabled: { readonly code: 23464; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly coex_edit_msg_enabled: { readonly code: 19039; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly coex_iicon_backfill: { readonly code: 28349; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly coex_revoke_message_enabled: { readonly code: 19285; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly coexv2_recv_enabled: { readonly code: 28110; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly coexv2_send_enabled: { readonly code: 27839; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly commerce_sanctioned: { readonly code: 1319; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly community_admin_promotion_one_time_prompt: { readonly code: 1864; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly community_announcement_group_size_limit: { readonly code: 2774; readonly type: "int"; readonly defaultValue: 5000; readonly debugDefaultValue: 5000 }
    readonly community_general_chat_UI_enabled: { readonly code: 5021; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly community_general_chat_create_enabled: { readonly code: 5453; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly community_invite_new_share_sheet_enabled: { readonly code: 39673; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly community_permissions_join_request_enabled: { readonly code: 40365; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly community_permissions_redesign_enabled: { readonly code: 39007; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly community_share_invite_setting_enabled: { readonly code: 39411; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly companion_contact_local_auto_heal: { readonly code: 35240; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly companion_contact_local_auto_heal_hours: { readonly code: 36178; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly companion_contact_refresh: { readonly code: 33093; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly companion_contact_refresh_debounce_ms: { readonly code: 33497; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly companion_contact_refresh_receiver: { readonly code: 33635; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly companion_critical_sync_progress_ui_enabled: { readonly code: 42073; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly companion_initiated_companion_contact_refresh: { readonly code: 33123; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly companion_pairing_progress_ui_enabled_prechatd: { readonly code: 42650; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly companion_passkey_pairing_enabled: { readonly code: 42682; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly companion_prechatd_pairing_progress_ui_enabled: { readonly code: 42069; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly consumer_graphql_enable_double_log_for_survey: { readonly code: 28129; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly consumer_graphql_web_to_fetch_qp_surface_ids: { readonly code: 28159; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly consumer_web_qp_graphql_to_fetch_qp_frequency_mins: { readonly code: 28529; readonly type: "int"; readonly defaultValue: 1320; readonly debugDefaultValue: 1320 }
    readonly contact_manager_mvp_enabled: { readonly code: 37166; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly contact_manager_sub_gating_enabled: { readonly code: 38023; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly context_menu_content_fix: { readonly code: 34337; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly country_client_gating_enabled: { readonly code: 1105; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly coupon_copy_button_url: { readonly code: 3631; readonly type: "string"; readonly defaultValue: "https://www.whatsapp.com/coupon?code="; readonly debugDefaultValue: "https://www.whatsapp.com/coupon?code=" }
    readonly create_group_and_add_member_overflow: { readonly code: 15772; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly cross_device_message_editing: { readonly code: 28340; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_1pd_conversion_excluded_message_type_ids: { readonly code: 35456; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ctwa_1pd_longest_call_enabled: { readonly code: 32108; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_1pd_message_type_exclusions_enabled: { readonly code: 35609; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_1pd_web_nbf_signals_enabled: { readonly code: 33508; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_aggregated_call_logging_allowed: { readonly code: 32379; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_aggregated_conversion_enabled: { readonly code: 27640; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_aggregated_label_logging_allowed: { readonly code: 37185; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_conversion_on_ae_detection: { readonly code: 34045; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_data_sharing_additional_logging: { readonly code: 29333; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_3pd_data_sharing_after_first_biz_reply: { readonly code: 37187; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_data_sharing_cooldown_max_times_shown_for_opted_out: { readonly code: 15686; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ctwa_3pd_data_sharing_disclosure_on_lists_home: { readonly code: 31224; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_data_sharing_on_thread_entry: { readonly code: 13485; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_data_sharing_title_change: { readonly code: 29332; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_opt_out_counter_optimization_enabled: { readonly code: 24984; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_per_customer_data_sharing_always_shown: { readonly code: 37186; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_3pd_post_dc_depth_limit: { readonly code: 24061; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 7 }
    readonly ctwa_ad_account_nonce_push_wait_timeout_web: { readonly code: 8664; readonly type: "int"; readonly defaultValue: 20; readonly debugDefaultValue: 20 }
    readonly ctwa_ad_account_nonce_retries_max_web: { readonly code: 8663; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ctwa_ad_account_token_storage_kill_switch_web: { readonly code: 8166; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: false }
    readonly ctwa_ad_creation_entry_point_catalog_product_web: { readonly code: 9677; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_ad_creation_entry_point_catalog_web: { readonly code: 9596; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_ae_model_meta_data_enabled: { readonly code: 27515; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_ae_model_meta_data_signal_enabled: { readonly code: 27516; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_ae_signal_3pd_enabled: { readonly code: 34663; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_ae_signal_3pd_field_policy: { readonly code: 34665; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly ctwa_block_ib_ar_for_wabai: { readonly code: 26302; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_coex_state_sync_enabled: { readonly code: 33676; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_conversation_counter_message_types: { readonly code: 43485; readonly type: "string"; readonly defaultValue: "text,image,video,audio,ptv,document,sticker,album,location,contact,interactive,list,interactiveResponse,buttonsResponse,templateButtonReply"; readonly debugDefaultValue: "text,image,video,audio,ptv,document,sticker,album,location,contact,interactive,list,interactiveResponse,buttonsResponse,templateButtonReply" }
    readonly ctwa_conversion_creation_from_delay_enabled: { readonly code: 32777; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_conversion_creation_skip_agm: { readonly code: 41995; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_ctx_disclosure_update_enabled: { readonly code: 35558; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_custom_label_algorithm: { readonly code: 14887; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ctwa_custom_label_server_mapping_allowed: { readonly code: 39561; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly ctwa_custom_label_signals_enabled: { readonly code: 11205; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_data_max_length: { readonly code: 1841; readonly type: "int"; readonly defaultValue: 768; readonly debugDefaultValue: 768 }
    readonly ctwa_download_3pd_signals: { readonly code: 13385; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_enable_biz_data_sharing_after_nux_dismiss: { readonly code: 13240; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_entry_point_config_fetch_threshhold: { readonly code: 6214; readonly type: "int"; readonly defaultValue: 43200000; readonly debugDefaultValue: 2000 }
    readonly ctwa_external_ad_reply_url_allowlist_domains: { readonly code: 29484; readonly type: "string"; readonly defaultValue: ".whatsapp.net,.whatsapp.com,.fbcdn.net,.facebook.com,.instagram.com,.cdninstagram.com"; readonly debugDefaultValue: ".whatsapp.net,.whatsapp.com,.fbcdn.net,.facebook.com,.instagram.com,.cdninstagram.com" }
    readonly ctwa_favorites_list_sends_signals: { readonly code: 29529; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_important_label_sends_signals: { readonly code: 15271; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_long_term_holdout_client_side_check: { readonly code: 11000; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_long_term_holdout_content_enabled: { readonly code: 8015; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_longest_call_duration: { readonly code: 32100; readonly type: "int"; readonly defaultValue: 120; readonly debugDefaultValue: 120 }
    readonly ctwa_mm_biz_ai_disclosure_update_enabled: { readonly code: 10379; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_native_ads_creation_web_enabled: { readonly code: 18857; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_native_ads_creation_web_hawk_tool_enabled: { readonly code: 20442; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_native_ads_creation_web_targeting_modal_hawk_tool_enabled: { readonly code: 20731; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_native_ads_inline_notice_modules: { readonly code: 32701; readonly type: "string"; readonly defaultValue: "AdsLWICTWAZeroOutcomeAdValidationModule,AdsLWICTWASimilarAdvertiserBudgetRecommendationValidationModule,AdsWaCtwaZeroOutcomeModelValidationModule"; readonly debugDefaultValue: "AdsLWICTWAZeroOutcomeAdValidationModule,AdsLWICTWASimilarAdvertiserBudgetRecommendationValidationModule,AdsWaCtwaZeroOutcomeModelValidationModule" }
    readonly ctwa_per_customer_data_sharing_controls_do_not_show_msg_until_chosen: { readonly code: 19763; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_show_ads_data_sharing_after_message: { readonly code: 13579; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_smb_ae_companion_onboarding_enabled: { readonly code: 33883; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_smb_ae_onboarding_compatability_code: { readonly code: 22067; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 127 }
    readonly ctwa_smb_ae_onboarding_enabled: { readonly code: 21259; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_smb_ae_onboarding_nux_auto_trigger_on_list_home: { readonly code: 23677; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_smb_data_sharing_consent: { readonly code: 2934; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_smb_data_sharing_opt_in_cool_off_period: { readonly code: 3331; readonly type: "int"; readonly defaultValue: 259200; readonly debugDefaultValue: 259200 }
    readonly ctwa_smb_data_sharing_settings_killswitch: { readonly code: 5615; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_smb_detected_outcome_labels_merger_enabled: { readonly code: 15308; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_smb_detected_outcome_lists_enabled: { readonly code: 20220; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_smb_h2_2026_ofs_migration_dummy_enabled: { readonly code: 43254; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_smb_h2_2026_ofs_migration_enabled: { readonly code: 37876; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_smb_label_chat_header_enabled_web: { readonly code: 25180; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_smb_lists_dropdown_application_fix_enabled: { readonly code: 30401; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_smb_multiselect_enabled: { readonly code: 26719; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_suppress_message_via_ad_spam_web: { readonly code: 17580; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_suppress_message_with_external_ad_reply_consumer_db_level_enabled: { readonly code: 21819; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_tos_filtering_enabled: { readonly code: 976; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_web_budgeting_na_zo_model_arm: { readonly code: 43013; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ctwa_web_budgeting_na_zo_model_dummy_arm: { readonly code: 43014; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ctwa_web_custom_label_signals_enabled: { readonly code: 19985; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_web_native_ads_budget_recommendation_enabled: { readonly code: 32511; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_web_native_ads_catalog_media_enabled: { readonly code: 36910; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_web_native_ads_catalog_media_enabled_dummy: { readonly code: 36916; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_web_native_ads_continuous_duration_default: { readonly code: 35282; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_web_native_ads_continuous_duration_default_dummy: { readonly code: 35283; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_web_native_ads_sabr_enabled: { readonly code: 32007; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ctwa_web_native_ads_status_boost_enabled: { readonly code: 43449; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ctwa_web_native_ads_status_boost_enabled_dummy: { readonly code: 43448; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly custom_notification_tones: { readonly code: 18884; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly custom_racing_emoji: { readonly code: 7463; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly custom_racing_emoji_feb2025: { readonly code: 13322; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly data_privacy_phase_2_enabled: { readonly code: 6843; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly data_privacy_phase_2_non_e2ee_enabled: { readonly code: 7131; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly data_sharing_transparency_indicator_duration: { readonly code: 5990; readonly type: "int"; readonly defaultValue: 604800; readonly debugDefaultValue: 604800 }
    readonly dau_fix_delay_presence_on_focus: { readonly code: 18189; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly dedupe_lid_pn_identity_key_stores: { readonly code: 33083; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly default_audio_limit_mb: { readonly code: 3657; readonly type: "int"; readonly defaultValue: 16; readonly debugDefaultValue: 64 }
    readonly default_endpoint_thread_poll_timeout: { readonly code: 11129; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly default_media_limit_mb: { readonly code: 3660; readonly type: "int"; readonly defaultValue: 16; readonly debugDefaultValue: 16 }
    readonly default_status_media_limit_mb: { readonly code: 3659; readonly type: "int"; readonly defaultValue: 16; readonly debugDefaultValue: 16 }
    readonly default_video_limit_mb: { readonly code: 3185; readonly type: "int"; readonly defaultValue: 16; readonly debugDefaultValue: 16 }
    readonly defense_mode_available: { readonly code: 13874; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly defense_mode_quarantine: { readonly code: 24959; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly defense_mode_quarantine_bulk_unblock_limit: { readonly code: 21921; readonly type: "int"; readonly defaultValue: 50; readonly debugDefaultValue: 50 }
    readonly defense_mode_quarantine_message_expiration_window: { readonly code: 21918; readonly type: "int"; readonly defaultValue: 1210000; readonly debugDefaultValue: 1210000 }
    readonly deleted_message_system_style_enabled: { readonly code: 39057; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly desktop_calling_ring_icon_enabled: { readonly code: 35376; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly desktop_upsell_intro_panel_illustration_variant: { readonly code: 19518; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly dev_prop_boolean: { readonly code: 1065; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly dev_prop_float: { readonly code: 1067; readonly type: "float"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly dev_prop_int: { readonly code: 1066; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly dev_prop_string: { readonly code: 1064; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly device_capabilities_v2_sync_enabled: { readonly code: 33380; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly device_switching_enabled: { readonly code: 3205; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly dialer_pad_for_new_chats: { readonly code: 18688; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly direct_connection_business_numbers: { readonly code: 1846; readonly type: "string"; readonly defaultValue: "16005554444,918591749310,917977079770"; readonly debugDefaultValue: "16005554444,918591749310,917977079770" }
    readonly directory_categories_display_newsletters_per_category_limit: { readonly code: 9312; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly directory_categories_newsletters_per_category_limit: { readonly code: 7986; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly disable_auto_download: { readonly code: 1838; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly disable_libaom_registration: { readonly code: 23836; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly disable_message_secret_for_edit_to_bot: { readonly code: 35238; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly disable_raise_hand_1on1: { readonly code: 27177; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly disappearing_mode: { readonly code: 536; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly disclosure_for_the_marketing_message_body_links_enabled: { readonly code: 12994; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly discovery_sticker_packs_count: { readonly code: 8198; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly discovery_stickers_count: { readonly code: 11836; readonly type: "int"; readonly defaultValue: 9; readonly debugDefaultValue: 9 }
    readonly dm_additional_durations: { readonly code: 3305; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly dm_after_read_timer_sender_options_seconds: { readonly code: 30176; readonly type: "string"; readonly defaultValue: "{\"timers\": [0, 300, 3600, 43200]}"; readonly debugDefaultValue: "{\"timers\": [0, 300, 3600, 43200]}" }
    readonly dm_initiator_trigger_daily_logs: { readonly code: 7402; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly dm_initiator_trigger_groups: { readonly code: 7141; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly dm_receiver_after_read_allow_values: { readonly code: 26218; readonly type: "string"; readonly defaultValue: "{\"timers\": [0, 900]}"; readonly debugDefaultValue: "{\"timers\": [0, 900]}" }
    readonly dm_receiver_allowed_values: { readonly code: 19232; readonly type: "string"; readonly defaultValue: "{\"timers\": [0, 86400, 604800, 7776000]}"; readonly debugDefaultValue: "{\"timers\": [0, 86400, 604800, 7776000]}" }
    readonly dm_reliability_logging: { readonly code: 5580; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly dm_updated_system_message: { readonly code: 1670; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly document_format_verification_enabled: { readonly code: 37236; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly document_format_verification_enforcement_enabled: { readonly code: 37650; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly document_format_verification_mime_exclusions: { readonly code: 37235; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly download_document_thumb_mms_enabled: { readonly code: 250; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly download_status_thumb_mms_enabled: { readonly code: 249; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly drop_last_name: { readonly code: 726; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly dsa_21_channel_reporting_enabled: { readonly code: 21073; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly dsa_26_receiver_enabled: { readonly code: 22515; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly dsa_26_sender_enabled: { readonly code: 22516; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly dsa_channels_report_unlawful_content_enabled: { readonly code: 6145; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly dsa_information_for_eu_only_enabled: { readonly code: 7592; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly early_audio_driver_capture_at_native: { readonly code: 13166; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly early_audio_driver_pre_buffering: { readonly code: 13168; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly early_bot_connect_event_bitmap: { readonly code: 14200; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly elevated_push_names_v2_m2_enabled: { readonly code: 2904; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly emoji_search_cldr: { readonly code: 13323; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly empty_unread_filter_cta_variant: { readonly code: 22962; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly enable_1on1_call_transfer_entry_point: { readonly code: 36841; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_1on1_call_transfer_switchable: { readonly code: 39975; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_3p_contacts_share_hybrid: { readonly code: 20849; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_advanced_sticker_testing: { readonly code: 38292; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_agm_flow_cta: { readonly code: 22006; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_audio_device_async_start: { readonly code: 13231; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_auto_add_call_link_creator: { readonly code: 15184; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_av_downgrade_1on1: { readonly code: 18165; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_avatars_on_web_companion: { readonly code: 18081; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_busy_reason_fs: { readonly code: 9674; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_cached_media_manager: { readonly code: 4812; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_call_control_m5: { readonly code: 8524; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_call_link_call_log_aggregation: { readonly code: 16523; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_call_links_push_notification: { readonly code: 13679; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_call_result_fix_for_404_accept_nack: { readonly code: 10565; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_call_transfer_auto_switch: { readonly code: 36842; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_call_transfer_log_consolidation: { readonly code: 36843; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_call_transfer_notification: { readonly code: 29242; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_calling_phone_number_privacy: { readonly code: 17731; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_calling_username: { readonly code: 13359; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_calluser_video_deeplink: { readonly code: 32881; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_channel_video_server_thumbnail: { readonly code: 11192; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_chat_list_sticker_emojis: { readonly code: 9069; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_chat_psa_auto_play_videos: { readonly code: 3182; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_clear_formatted_preview: { readonly code: 4659; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_copy_paste_p2p: { readonly code: 27642; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_ctwa_ml_entry_point_config: { readonly code: 6216; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_days_since_receive_logging: { readonly code: 3322; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_early_audio_driver_start: { readonly code: 13807; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_events_v2_add_to_calendar: { readonly code: 29417; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly enable_events_v2_companion_features: { readonly code: 43023; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly enable_events_v2_entry_points_creation: { readonly code: 29361; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly enable_events_v2_invite_message_update: { readonly code: 32555; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_events_v2_invite_message_with_datetime: { readonly code: 32612; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_events_v2_on_companion: { readonly code: 30964; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_fmx_logging: { readonly code: 19893; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_force_voip_logging: { readonly code: 7300; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_fsa_save_as: { readonly code: 33783; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_futureproof_galaxy_flow_message_for_business_numbers: { readonly code: 22311; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly enable_grid_layout_tile_unification: { readonly code: 18066; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_group_create_or_add_rate_limiting_error_ux: { readonly code: 12020; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_hybrid_call_links_creation: { readonly code: 15502; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_hybrid_call_links_join: { readonly code: 15501; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_hybrid_open_with_shared_buffer: { readonly code: 34175; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_hybrid_video_transcoding: { readonly code: 19895; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_hybrid_video_transcoding_for_valid_mp4: { readonly code: 20070; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_init_bwe_for_group_call: { readonly code: 2601; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_join_group_context_non_auto_expose: { readonly code: 30282; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_join_ongoing_call_refactor: { readonly code: 34093; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_lanczos_upscaler_for_photos_bitmap: { readonly code: 35482; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly enable_lanczos_upscaler_for_vod_bitmap: { readonly code: 34626; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly enable_lanczos_video_chat_fullscreen: { readonly code: 35567; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_lanczos_video_inline_chat: { readonly code: 35569; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_lanczos_video_status_fullscreen: { readonly code: 35568; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_lazy_loading_of_call_view_elements: { readonly code: 5053; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_lid_call_link: { readonly code: 8180; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_logging_qbm_incoming_message: { readonly code: 25149; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_mention_everyone_receiver_web: { readonly code: 24843; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_mention_everyone_sender_web: { readonly code: 24844; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_mention_everyone_syncd_sender: { readonly code: 24244; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_minimize_individual_mutation_write: { readonly code: 8910; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_ml_bwe_model_download: { readonly code: 4349; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_new_ongoing_call_cell_ui: { readonly code: 11426; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_new_user_action_stanza_for_raise_hand_sender: { readonly code: 18489; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_offer_v2_upgrade: { readonly code: 26435; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_orbit_sso_bridge: { readonly code: 32299; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_order_details_for_payment_key: { readonly code: 27643; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_peer_snapshot_recovery: { readonly code: 16329; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_photo_thumbnails_in_chat_list: { readonly code: 32842; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_poll_results_contact_info_entry_point: { readonly code: 33818; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_poll_settings_label_improved_layout: { readonly code: 32778; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_pre_warm_audio_component: { readonly code: 15994; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_privacy_token_with_timestamp: { readonly code: 4992; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_product_carousel_message: { readonly code: 7177; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_rate_app_prompt: { readonly code: 19894; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_ring_for_gc_on_offer_expire: { readonly code: 10103; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_rx_video_enhance_chat_fullscreen: { readonly code: 36428; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_rx_video_enhance_status: { readonly code: 36429; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_scheduled_calls_v2_entry_points_creation: { readonly code: 29793; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly enable_setup_error_result_check: { readonly code: 28689; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_sharing_files_from_web_windows_hybrid: { readonly code: 21184; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_silent_offer: { readonly code: 3235; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_soox_message_sending: { readonly code: 2832; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_spam_report_iq_with_privacy_token: { readonly code: 4991; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_spam_reporting_pre_logging: { readonly code: 14573; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_sticker_thumbnails_creation: { readonly code: 34116; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_sticker_thumbnails_in_chat_list: { readonly code: 32138; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_sticker_verification_for_gimmick: { readonly code: 7886; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_sync_for_draft_messages: { readonly code: 29314; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_syncd_coex_v2: { readonly code: 31810; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_syncd_debug_data_in_patch: { readonly code: 6614; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_syncd_write_coex_v2: { readonly code: 37465; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_thubms_up_for_auth_utility: { readonly code: 41517; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_tooltip_for_media_hub: { readonly code: 21535; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_turn_on_call_notification_reminders: { readonly code: 5360; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_ugc_voice_fs_logging: { readonly code: 14641; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_unified_call_buttons_in_chat: { readonly code: 13497; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_upcoming_schedule_call_events_in_calls_tab: { readonly code: 15514; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_uwp_device_switch_banner: { readonly code: 10416; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_uwp_share_any_window: { readonly code: 4801; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_video_metrics_fix: { readonly code: 20520; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_video_thumbnails_in_chat_list: { readonly code: 32841; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_vod_itm_chat_fullscreen: { readonly code: 38380; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_vod_itm_status: { readonly code: 38383; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_vod_sharpen_chat_fullscreen: { readonly code: 38267; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_vod_sharpen_status: { readonly code: 38268; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_vsr_chat_fullscreen: { readonly code: 38038; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_vsr_stats: { readonly code: 40846; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_vsr_status_fullscreen: { readonly code: 38037; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_waiting_room_admin_ui: { readonly code: 21676; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_waiting_room_logging: { readonly code: 24991; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_waiting_room_ui: { readonly code: 19819; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_wds_calling_dropdown: { readonly code: 26974; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_web_calling: { readonly code: 15461; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_calling_beta_upsell: { readonly code: 24812; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_calling_nux: { readonly code: 24504; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_group_calling: { readonly code: 20924; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_log_download: { readonly code: 28226; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_voip_anr_optimizations: { readonly code: 27268; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_web_voip_audio_driver_lifetime_fix: { readonly code: 33581; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_web_voip_eager_mic_acquire: { readonly code: 29836; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_voip_p2p: { readonly code: 25621; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_voip_platform_av_sync: { readonly code: 25177; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_voip_proxy_and_sctp_workers: { readonly code: 26012; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_web_voip_video_capture_dom_attach: { readonly code: 33953; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_web_voip_virtual_video_capture_driver: { readonly code: 26817; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_voip_webtransport: { readonly code: 29764; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_voip_webtransport_fallback: { readonly code: 33539; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_web_voip_webtransport_fast_setup: { readonly code: 36550; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_web_voip_webtransport_group_calls: { readonly code: 34645; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_web_voip_webtransport_until_accept: { readonly code: 42895; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_web_voip_worker_pool_reclaim_on_rejoin: { readonly code: 33597; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_webcodec_require_keyframe: { readonly code: 29510; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_webcodec_video_encode: { readonly code: 26079; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly enable_webcodec_video_encoder_output_watchdog: { readonly code: 35420; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_webrtc_video_jb: { readonly code: 27591; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_wefr_client_expo_pulse: { readonly code: 10230; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_windows_jumplist_hybrid: { readonly code: 20899; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_windows_mocks_capture_drivers: { readonly code: 31159; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enable_windows_xdr_chat_handoff: { readonly code: 24783; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enable_windows_xdr_wns_pkey: { readonly code: 32324; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly enhanced_mention_limit: { readonly code: 25951; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly enhanced_mention_suggestions_allow_non_group_members_with_group_members: { readonly code: 39242; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enhanced_mention_suggestions_min_mention_char_count: { readonly code: 28089; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly enhanced_mention_suggestions_non_group_members_enabled: { readonly code: 24852; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly enhanced_mention_suggestions_restrict_add_tap_target: { readonly code: 40820; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ephemeral_sync_response: { readonly code: 2714; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly event_description_length_limit: { readonly code: 6208; readonly type: "int"; readonly defaultValue: 2048; readonly debugDefaultValue: 2048 }
    readonly event_name_length_limit: { readonly code: 6207; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly events_create_cag_enabled: { readonly code: 9932; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly events_m3_cover_image_receive: { readonly code: 7511; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly events_m3_cover_image_send: { readonly code: 7510; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly events_v2_enable_notifications: { readonly code: 31418; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly events_v2_hide_add_to_calendar_post_start_window_sec: { readonly code: 30826; readonly type: "int"; readonly defaultValue: 1800; readonly debugDefaultValue: 1800 }
    readonly events_v2_invitation_message_version: { readonly code: 26618; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly events_v2_invite_message_self_state_enabled: { readonly code: 42975; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly evolve_about_m1_receiver_enabled: { readonly code: 5839; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly evolve_about_m1_receiver_for_new_surfaces_enabled: { readonly code: 6172; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly expanded_formatting_menu_items_enabled: { readonly code: 38882; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly expanded_formatting_multiline_quotes: { readonly code: 38177; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly extensions_geoblocking_enabled: { readonly code: 5333; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly extensions_user_report_store_max_data_exchanges_per_session: { readonly code: 3211; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly extensions_user_report_store_max_data_max_sessions_per_message: { readonly code: 3212; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly external_beta_can_join: { readonly code: 3081; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly external_ctx_authorise_existing_chats: { readonly code: 12761; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly external_ctx_authorise_wa_chat: { readonly code: 11655; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly external_ctx_foa_logging: { readonly code: 13565; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly external_ctx_url_param_names: { readonly code: 12726; readonly type: "string"; readonly defaultValue: "partnertoken"; readonly debugDefaultValue: "partnertoken" }
    readonly falco_canonical_field_values_to_ignore: { readonly code: 40268; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly falco_md_id_fix_web_enabled: { readonly code: 39179; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly favorite_sticker_sync_after_pairing_enabled_web: { readonly code: 20815; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly favorites_limit: { readonly code: 7267; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly feature_key_store_infra_enabled: { readonly code: 26829; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly fetch_qp_via_graphql_web_enabled: { readonly code: 28158; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly flows_termination_message_v2_sending_enabled: { readonly code: 9157; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly flows_wa_web: { readonly code: 12520; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly flows_wa_web_agm_cta: { readonly code: 24215; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly flows_wa_web_responses_download: { readonly code: 24216; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly fmx_ctwa_kill_switch: { readonly code: 6061; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly fmx_manage_messages_simplified_logging_symmetry_enabled: { readonly code: 37451; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly fmx_persistent_country_trust_signal_enabled: { readonly code: 33926; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly forward_reach_score_send_enabled: { readonly code: 41634; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly forward_reach_stats_daily_bucket_cap: { readonly code: 41636; readonly type: "int"; readonly defaultValue: 50; readonly debugDefaultValue: 50 }
    readonly forward_reach_stats_logging_enabled: { readonly code: 41635; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly forwarded_message_user_journey_logging_enabled: { readonly code: 16055; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly four_reactions_in_bubble_enabled: { readonly code: 2378; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ft_validation_failure_drop_placeholder: { readonly code: 13063; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly fullscreen_animation_for_keyword: { readonly code: 2776; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly functional_chatlist_enabled: { readonly code: 21799; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly functional_emoji_text_enabled: { readonly code: 34047; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly futureproof_associated_child_enabled: { readonly code: 11976; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly gc_device_switch_show_entry_point: { readonly code: 33281; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly gc_device_switching_killswitch: { readonly code: 26182; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly genai_early_audio_pre_buf_size: { readonly code: 15306; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly gif_max_play_duration: { readonly code: 3684; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly gif_max_play_loops: { readonly code: 3683; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly gif_min_play_loops: { readonly code: 3682; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly gif_provider: { readonly code: 14343; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly gimmick_phase_two_data_suffix: { readonly code: 6785; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly giphy_pma_shutoff_enabled: { readonly code: 27942; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly give_dogfooders_task_id_for_bug_reporting: { readonly code: 27444; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly graphql_get_product_list: { readonly code: 8800; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly graphql_locale_remapping: { readonly code: 2014; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly group_admin_hub: { readonly code: 39337; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_call_max_participants: { readonly code: 4190; readonly type: "int"; readonly defaultValue: 32; readonly debugDefaultValue: 32 }
    readonly group_calling_wave_receiving_enabled: { readonly code: 29161; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_calling_wave_sending_enabled: { readonly code: 29247; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_create_add_using_lid_jids: { readonly code: 16192; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_description_length: { readonly code: 14778; readonly type: "int"; readonly defaultValue: 2048; readonly debugDefaultValue: 2048 }
    readonly group_enc_key_enabled: { readonly code: 29673; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_from_group: { readonly code: 24024; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_from_group_admin_max_size: { readonly code: 34956; readonly type: "int"; readonly defaultValue: 128; readonly debugDefaultValue: 128 }
    readonly group_from_group_ban_risk_mitigation_enabled: { readonly code: 34955; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_after_join_prerequisites: { readonly code: 28787; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_after_join_sender_prerequisites: { readonly code: 35987; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly group_history_bump_message_id: { readonly code: 16346; readonly type: "int"; readonly defaultValue: 200; readonly debugDefaultValue: 200 }
    readonly group_history_bundle_time_limit_receiver_enforcement_secs: { readonly code: 25910; readonly type: "int"; readonly defaultValue: 1209600; readonly debugDefaultValue: 1209600 }
    readonly group_history_cta_stored_window_enabled: { readonly code: 40108; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_message_count_limit: { readonly code: 18405; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly group_history_message_count_receiver_upper_limit: { readonly code: 19811; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly group_history_messages_time_limit_receiver_enforcement_secs: { readonly code: 21313; readonly type: "int"; readonly defaultValue: 3888000; readonly debugDefaultValue: 3888000 }
    readonly group_history_messages_time_limit_secs: { readonly code: 18406; readonly type: "int"; readonly defaultValue: 2592000; readonly debugDefaultValue: 2592000 }
    readonly group_history_new_user_threshold_receiver_enforcement_secs: { readonly code: 30345; readonly type: "int"; readonly defaultValue: 2592000; readonly debugDefaultValue: 2592000 }
    readonly group_history_new_user_threshold_secs: { readonly code: 30333; readonly type: "int"; readonly defaultValue: 2592000; readonly debugDefaultValue: 2592000 }
    readonly group_history_notice_receive: { readonly code: 15722; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_out_of_window_pin_sender: { readonly code: 26037; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_out_of_window_pins_receiver: { readonly code: 26039; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_per_group_toggle_md_sync: { readonly code: 36501; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_history_receive: { readonly code: 15311; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_history_receiver_dedup: { readonly code: 30462; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_receiver_floating_banner: { readonly code: 21568; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_reporting: { readonly code: 22329; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly group_history_send: { readonly code: 15313; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_send_adding_from_contact_message: { readonly code: 35555; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_send_adding_from_mention: { readonly code: 35554; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_send_adding_to_multiple_groups: { readonly code: 35553; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_history_send_admin_approval: { readonly code: 35556; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_history_send_admin_set_default_on: { readonly code: 36500; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_history_send_after_join: { readonly code: 26451; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_send_default_on: { readonly code: 36498; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_send_once_default_on: { readonly code: 36499; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_history_sender_speed_bump_dialog_display_times: { readonly code: 18317; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly group_history_setting_decouple_enabled: { readonly code: 29973; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_settings: { readonly code: 21261; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_settings_query: { readonly code: 22230; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_settings_toggle_ui: { readonly code: 21481; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_support_history_sync_receiver_pre_chat: { readonly code: 20658; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_join_request_m2_banner_on_conversation: { readonly code: 2449; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_join_validation_questions_setting_enabled: { readonly code: 36245; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_max_subject: { readonly code: 14801; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly group_member_updates_hide_in_thread_enabled: { readonly code: 24584; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_member_updates_past_participant_migration_enabled: { readonly code: 31614; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_member_updates_username_description_enabled: { readonly code: 28087; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_member_updates_usernames_db_enabled: { readonly code: 24586; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_member_updates_usernames_enabled: { readonly code: 24617; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_member_updates_usernames_ui_enabled: { readonly code: 24585; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_membership_form_gem_enabled: { readonly code: 41646; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_membership_form_join_enabled: { readonly code: 36941; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_membership_form_max_questions: { readonly code: 36921; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly group_membership_form_question_max_length: { readonly code: 37163; readonly type: "int"; readonly defaultValue: 200; readonly debugDefaultValue: 200 }
    readonly group_membership_form_review_enabled: { readonly code: 38134; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_membership_form_setting_enabled: { readonly code: 36322; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_settings_ia_prototype: { readonly code: 34025; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly group_size_bypassing_sampling: { readonly code: 1861; readonly type: "int"; readonly defaultValue: 100000; readonly debugDefaultValue: 100000 }
    readonly group_size_limit: { readonly code: 1304; readonly type: "int"; readonly defaultValue: 257; readonly debugDefaultValue: 257 }
    readonly group_status_receiver_enabled: { readonly code: 13956; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_suspend_appeal_include_entity_id_enabled: { readonly code: 2057; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_suspend_v2_enabled: { readonly code: 3180; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_suspension_appeals_redesign_enabled: { readonly code: 26276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_suspension_appeals_redesign_variant_enable: { readonly code: 28376; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_username_updates_as_member_updates_enabled: { readonly code: 24477; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly groups_mex_fetch_membership_approval_requests_enabled: { readonly code: 38646; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly guest_calling_call_log_mitigation_enabled: { readonly code: 36069; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly guest_calling_discoverability_awareness: { readonly code: 42722; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly guest_calling_discoverability_invite_flows: { readonly code: 43168; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly hand_raise_receiver_enabled: { readonly code: 13540; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly harmful_file_dialog_logging: { readonly code: 15020; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly hash_identity_keys_for_qr_code_device_verification: { readonly code: 9211; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly hatch_pairing_from_companion_enabled: { readonly code: 32497; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly hd_video_definition_max_edge: { readonly code: 4172; readonly type: "int"; readonly defaultValue: 864; readonly debugDefaultValue: 864 }
    readonly hd_video_definition_min_edge: { readonly code: 4171; readonly type: "int"; readonly defaultValue: 720; readonly debugDefaultValue: 720 }
    readonly hd_video_definition_min_edge_with_max_edge: { readonly code: 4175; readonly type: "int"; readonly defaultValue: 480; readonly debugDefaultValue: 480 }
    readonly heartbeat_interval_s: { readonly code: 1430; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 5 }
    readonly hide_auto_quotes_on_web: { readonly code: 20892; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hide_silent_system_message_enabled: { readonly code: 24268; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly history_sync_on_demand: { readonly code: 3337; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly history_sync_on_demand_companion: { readonly code: 17198; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly history_sync_on_demand_cooldown_sec: { readonly code: 4365; readonly type: "int"; readonly defaultValue: 7200; readonly debugDefaultValue: 7200 }
    readonly history_sync_on_demand_failure_limit: { readonly code: 4364; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly history_sync_on_demand_message_count: { readonly code: 3811; readonly type: "int"; readonly defaultValue: 50; readonly debugDefaultValue: 50 }
    readonly history_sync_on_demand_time_boundary_days_desktops: { readonly code: 18391; readonly type: "int"; readonly defaultValue: 1095; readonly debugDefaultValue: 1095 }
    readonly history_sync_on_demand_timeout_ms: { readonly code: 3882; readonly type: "int"; readonly defaultValue: 10000; readonly debugDefaultValue: 10000 }
    readonly history_sync_on_demand_with_android_beta: { readonly code: 4135; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly history_sync_recent_conversations_on_demand_companion: { readonly code: 40044; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hosted_message_flag_enabled: { readonly code: 27979; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hsm_tag_in_history_sync_deserialization_enabled: { readonly code: 25804; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hybrid_educational_dialog_start_at: { readonly code: 14675; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: " " }
    readonly hybrid_educational_dialogs_enabled: { readonly code: 14674; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hybrid_flytrap_feedback_enabled: { readonly code: 19495; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hybrid_font_size_dropdown: { readonly code: 17637; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly hybrid_incremental_zooming_simple_enabled: { readonly code: 18080; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hybrid_nux_beta_50_enabled: { readonly code: 17717; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly hybrid_save_as_shared_buffer_enabled: { readonly code: 34993; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ignore_joinable_terminate_on_expired_offer: { readonly code: 11519; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ignore_one_to_one_terminate_in_group_call: { readonly code: 10273; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly im_a2ui_reply_quote_enabled: { readonly code: 35806; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly im_a2ui_require_bot_attribution: { readonly code: 34324; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly im_bloks_widget_enable: { readonly code: 25071; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly im_nfm_multi_step_form_killswitch: { readonly code: 28891; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly imp_send_signal_post_connect_delay: { readonly code: 23323; readonly type: "int"; readonly defaultValue: 500; readonly debugDefaultValue: 500 }
    readonly imp_send_signal_post_connect_webc_enabled: { readonly code: 23322; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly improve_group_reporting: { readonly code: 26114; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly in_app_bug_reporting_description_good_quality_chars: { readonly code: 22361; readonly type: "int"; readonly defaultValue: 50; readonly debugDefaultValue: 50 }
    readonly in_app_bug_reporting_show_quality_hints_v1: { readonly code: 22363; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly in_app_comms_manage_ads_web_banner_campaign_enabled: { readonly code: 4542; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly in_app_support_capi_number_prefixes: { readonly code: 4799; readonly type: "string"; readonly defaultValue: "155178684"; readonly debugDefaultValue: "155178684" }
    readonly in_app_support_v2_number_prefixes: { readonly code: 1031; readonly type: "string"; readonly defaultValue: "15517868"; readonly debugDefaultValue: "15517868" }
    readonly in_p2m_payments_deep_link: { readonly code: 40250; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly inapp_signup_agm_cta_experiment: { readonly code: 27860; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly inapp_signup_confirmation_message_enabled: { readonly code: 26390; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly inapp_signup_m1_logging_enabled: { readonly code: 28142; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly inapp_signup_qpl_logging_enabled: { readonly code: 28806; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly inapp_signup_received_card_enabled: { readonly code: 33503; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly inapp_signup_web_cta_logging_enabled: { readonly code: 30498; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly inbox_dim_muted_chats: { readonly code: 36646; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly inbox_filters_custom_smb_enabled: { readonly code: 7637; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly inbox_filters_enabled: { readonly code: 5171; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly inbox_filters_haptic_feedback_enabled: { readonly code: 6052; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly inbox_filters_read_unread_logging_enabled: { readonly code: 6967; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly inbox_filters_reset_timeout: { readonly code: 5765; readonly type: "int"; readonly defaultValue: 1800; readonly debugDefaultValue: 1800 }
    readonly inbox_filters_smb_enabled: { readonly code: 7108; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly inbox_filters_suppress_contact_filter: { readonly code: 7769; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly instants_receiver_enabled: { readonly code: 41426; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly integrity_drop_receipt_enabled: { readonly code: 40223; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly interactive_message_native_flow_killswitch: { readonly code: 1133; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly interactive_response_message_killswitch: { readonly code: 1435; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly internal_group_indicator: { readonly code: 18109; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly invite_deactivated_user_web: { readonly code: 31516; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ios_reaction_picker_wds_header_enabled: { readonly code: 33885; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly is_ai_mode_selector_visible: { readonly code: 24489; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly is_expand_fmx_account_age_bolded_non_auto_expose: { readonly code: 26549; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_expand_fmx_account_age_ui_enabled: { readonly code: 26548; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_expand_fmx_enabled_non_auto_expose: { readonly code: 26551; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_expand_fmx_mex_enabled: { readonly code: 26550; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_guest_calling_eligible: { readonly code: 35115; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly is_individual_suspicious_fmx_enabled: { readonly code: 26191; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_internal_tester: { readonly code: 2945; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_meta_employee_or_internal_tester: { readonly code: 1777; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly is_part_of_gsc_experiment: { readonly code: 14279; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly is_pmx_funnel_metrics_logging_enabled: { readonly code: 6816; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_pmx_hashed_msg_key_logging_enabled: { readonly code: 6837; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly is_preview_rich_format_enabled: { readonly code: 35350; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly is_spoiler_rich_format_enabled: { readonly code: 22221; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly is_spoiler_rich_format_sender_enabled: { readonly code: 24210; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly joinable_client_poll_interval_min: { readonly code: 522; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 5 }
    readonly kaleidoscope_thumbnail_validation: { readonly code: 18114; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly keep_in_chat_undo_duration_limit: { readonly code: 1698; readonly type: "int"; readonly defaultValue: 2592000; readonly debugDefaultValue: 2592000 }
    readonly kill_switch_ctwa_ml_entry_point_config: { readonly code: 6215; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: false }
    readonly klipy_memes_enabled: { readonly code: 38720; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ks_allow_av1_video_codec: { readonly code: 37900; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ks_audio_claimed_type_validation_enabled: { readonly code: 41378; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ks_claimed_type_validation_enabled: { readonly code: 42641; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ks_jpeg_scan_strict_validation_enabled: { readonly code: 39756; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ks_mp4_fragmented_streaming_enabled: { readonly code: 38920; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ks_mp4_strict_validation_enabled: { readonly code: 38174; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ks_ogg_opus_strict_validation_enabled: { readonly code: 37509; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ks_pdf_strict_validation_enabled: { readonly code: 37251; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ks_use_component_model: { readonly code: 26966; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ks_zip_archive_check_enabled: { readonly code: 40795; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly lanczos_min_upscale_scale_for_vod: { readonly code: 35473; readonly type: "float"; readonly defaultValue: 1.2000000476837158; readonly debugDefaultValue: 1.2000000476837158 }
    readonly lazy_system_message_insertion_enabled: { readonly code: 9077; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly legacy_provenance_detection_disabled: { readonly code: 41650; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_group_creation_addressing_mode_override: { readonly code: 12985; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_group_migration_non_member_iq: { readonly code: 16104; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly lid_migration_daily_group_composition_enabled: { readonly code: 34155; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly lid_migration_for_biz_profile_enabled: { readonly code: 12000; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_migration_for_vname_enabled: { readonly code: 11049; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_migration_notifications_enabled: { readonly code: 8785; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_one_on_one_migration_compatible: { readonly code: 13161; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly lid_one_on_one_migration_enabled: { readonly code: 9435; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_one_on_one_migration_peer_sync_timeout_in_seconds: { readonly code: 13936; readonly type: "int"; readonly defaultValue: 300; readonly debugDefaultValue: 300 }
    readonly lid_pn_username_mapping_logging_enabled: { readonly code: 31266; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_status_non_soaked_client_support_enabled: { readonly code: 19696; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly lid_status_send_enabled: { readonly code: 6791; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lid_trusted_token_issue_to_lid: { readonly code: 14303; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lightweight_group_creation: { readonly code: 27819; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly limit_sharing_enabled_for_1on1_chat: { readonly code: 15127; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly limit_sharing_protocol_message_receiver_enabled: { readonly code: 15129; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly limit_sharing_update_enabled_web: { readonly code: 16376; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly link_preview_wait_time: { readonly code: 2566; readonly type: "int"; readonly defaultValue: 7; readonly debugDefaultValue: 7 }
    readonly lists_chat_list_row_pill_enabled: { readonly code: 24133; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lists_smb_enabled: { readonly code: 18229; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly lists_smb_web_m2_enabled2: { readonly code: 36854; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly live_location_companion_viewing_enabled: { readonly code: 42584; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly lobby_timeout_min: { readonly code: 1565; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly log_clock_skew: { readonly code: 1190; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly low_cache_hit_rate_media_types: { readonly code: 4836; readonly type: "string"; readonly defaultValue: "ptt,audio,document,ppic"; readonly debugDefaultValue: "ptt,audio,document,ppic" }
    readonly lthash_check_hours: { readonly code: 1104; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly m2_audience_dynamic_rules: { readonly code: 28099; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly maiba_meta_ai_fab_nullstate_is_deprecated: { readonly code: 32490; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mark_as_verified_enabled: { readonly code: 29343; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly max_group_size_for_long_ringtone: { readonly code: 4710; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly max_num_participants_for_ss: { readonly code: 3694; readonly type: "int"; readonly defaultValue: 8; readonly debugDefaultValue: 8 }
    readonly max_number_of_recent_contacts_shared_with_device: { readonly code: 10978; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly maximum_group_size_for_rcat: { readonly code: 2915; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly may_have_messages_enabled: { readonly code: 25303; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mc_enabled: { readonly code: 32843; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly md_app_state_gate_D34336913: { readonly code: 1379; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly md_icdc_hash_length: { readonly code: 310; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly md_logout_trigger_enabled: { readonly code: 43274; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly md_offline_v2_m2_enabled: { readonly code: 1517; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly md_omitted_conversation_metadata_enabled: { readonly code: 40347; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly md_stanzas_lid: { readonly code: 34764; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly md_syncd_bundle_logging: { readonly code: 27126; readonly type: "string"; readonly defaultValue: "{\"allowlist\": []}"; readonly debugDefaultValue: "{\"allowlist\": []}" }
    readonly md_syncd_mutation_logging: { readonly code: 27124; readonly type: "string"; readonly defaultValue: "{\"allowlist\": []}"; readonly debugDefaultValue: "{\"allowlist\": []}" }
    readonly md_syncd_mutation_summary_logging: { readonly code: 27125; readonly type: "string"; readonly defaultValue: "{\"allowlist\": []}"; readonly debugDefaultValue: "{\"allowlist\": []}" }
    readonly media_cross_reference_download_enabled: { readonly code: 35111; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly media_cross_reference_upload_enabled: { readonly code: 35109; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly media_default_auto_download_quality_to_hd_for_dual_photo_enabled: { readonly code: 16931; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly media_default_hd_upload_quality_enabled: { readonly code: 15740; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly media_elst_timing_refinement_enabled: { readonly code: 36067; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly media_force_transcode_on_elst: { readonly code: 30235; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly media_hub_history_max_days: { readonly code: 22518; readonly type: "int"; readonly defaultValue: 14; readonly debugDefaultValue: 14 }
    readonly media_large_file_awareness_popup_file_size_in_MB: { readonly code: 3115; readonly type: "int"; readonly defaultValue: 2048; readonly debugDefaultValue: 2048 }
    readonly media_picker_select_limit: { readonly code: 2614; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly media_picker_select_limit_new: { readonly code: 2693; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly media_quality_auto_download_settings_enabled: { readonly code: 21784; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly media_viewer_accelerated_playback_enabled: { readonly code: 12813; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly member_name_tag_db_enabled: { readonly code: 16551; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly member_name_tag_receiver_enabled: { readonly code: 13523; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly member_name_tag_sender_enabled: { readonly code: 13524; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly member_name_tag_web_receiver_enabled: { readonly code: 22655; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly member_name_tag_web_sender_enabled: { readonly code: 22654; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly message_association_infra_enabled: { readonly code: 8783; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly message_count_logging_md_enabled: { readonly code: 1135; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly message_edit_client_entry_point_limit_seconds: { readonly code: 3272; readonly type: "int"; readonly defaultValue: 900; readonly debugDefaultValue: 900 }
    readonly message_edit_to_message_secret_receiver_enabled: { readonly code: 17811; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly message_edit_to_message_secret_sender_enabled: { readonly code: 16057; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly message_edit_window_duration_seconds: { readonly code: 2983; readonly type: "int"; readonly defaultValue: 1200; readonly debugDefaultValue: 1200 }
    readonly message_keys_async_chunk_size: { readonly code: 22815; readonly type: "int"; readonly defaultValue: 50; readonly debugDefaultValue: 50 }
    readonly message_partial_selection_discoverability: { readonly code: 34826; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly message_partial_selection_in_bubble: { readonly code: 34585; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly message_partial_selection_m2: { readonly code: 32142; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly message_yourself_edit_window_is_forever_enabled: { readonly code: 37948; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly meta_ai_in_app_survey_enabled: { readonly code: 17956; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly meta_catalog_linking_m2_enabled: { readonly code: 11029; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly meta_one_biz_ai_power_user_upsell: { readonly code: 42517; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly meta_one_smb_focus_schedules_enabled: { readonly code: 42177; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly meta_one_smb_original_media_enabled: { readonly code: 42567; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly meta_verified_badge_education_vai_content: { readonly code: 7976; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly mex_get_privacy_contact_list_enabled: { readonly code: 23874; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mex_get_privacy_settings_mode: { readonly code: 23463; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 1 }
    readonly mex_group_get_group_info_by_add_request: { readonly code: 40230; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mex_group_get_group_info_by_invite_code: { readonly code: 9428; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mex_group_get_linked_group_info_enabled: { readonly code: 14772; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mex_group_join: { readonly code: 39621; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mex_phase3_enabled: { readonly code: 2249; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mex_phase3_status_flags: { readonly code: 2250; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly mex_usync_about_status: { readonly code: 9524; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly mex_usync_username_query: { readonly code: 8421; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ml_model_download_skip_hash_check: { readonly code: 11454; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly mm_1pd_post_dc_depth_limit: { readonly code: 26281; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly mm_1pd_post_dc_new_schema_enabled: { readonly code: 26280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_1pd_post_dc_old_schema_disabled: { readonly code: 26282; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_data_sharing_disclosure_enabled: { readonly code: 5869; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_data_sharing_disclosure_enabled_additional_transparency_large_screens: { readonly code: 25421; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_data_sharing_disclosure_enabled_companion_history_sync: { readonly code: 21288; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly mm_data_sharing_disclosure_on_chat_open_enabled: { readonly code: 17630; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_disclosure_handle_tos_failures_enabled: { readonly code: 28572; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_disclosure_learn_more_article_id: { readonly code: 25021; readonly type: "string"; readonly defaultValue: "263784176043634"; readonly debugDefaultValue: "263784176043634" }
    readonly mm_message_level_feedback_enabled: { readonly code: 10011; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_message_level_feedback_not_interested_menu_enabled: { readonly code: 10668; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_opt_out_enabled: { readonly code: 11241; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_opt_out_fmx_stop_for_high_trust: { readonly code: 12172; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_opt_out_lid_migration_enabled: { readonly code: 16952; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_optimized_delivery_app_cta_enabled: { readonly code: 22776; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_optimized_delivery_archive_signal_sharing_enabled: { readonly code: 28558; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_optimized_delivery_replacing_shimmed_links_enabled: { readonly code: 21782; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_optimized_delivery_token_fallback_disabled: { readonly code: 29002; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly mm_optimized_delivery_unique_token_per_message_id_enabled: { readonly code: 29037; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly mm_signal_sharing_collection_window_logging_enabled: { readonly code: 18126; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_signal_sharing_post_dc_message_type_enabled: { readonly code: 39441; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_signal_sharing_verification_new_signal_type_origin: { readonly code: 26784; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly mm_signal_sharing_verification_system_lid_enabled: { readonly code: 16727; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly mm_tap_target_bloks_client_hydration_enabled: { readonly code: 28473; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_template_message_telemetry_is_first_mm_enabled: { readonly code: 32482; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_template_message_telemetry_strict_first_mm_enabled: { readonly code: 33160; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly mm_user_controls_entry_points_update_m1_icon: { readonly code: 20388; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly mm_user_controls_entry_points_update_m1_menu: { readonly code: 20381; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly mm_user_controls_exception_number_prefixes: { readonly code: 13999; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly mm_user_controls_exposure: { readonly code: 13510; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mm_user_controls_unified_logging_symmetry_enabled: { readonly code: 35432; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly mm_user_controls_unified_stop_enabled: { readonly code: 34622; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly mms_vcache_aggregation_enabled: { readonly code: 2134; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_ohai_proxy_url: { readonly code: 10975; readonly type: "string"; readonly defaultValue: "https://meta-ohttp-relay-prod.fastly-edge.com/"; readonly debugDefaultValue: "https://meta-ohttp-relay-prod.fastly-edge.com/" }
    readonly music_on_chats_artwork_pixel_side_size: { readonly code: 36559; readonly type: "int"; readonly defaultValue: 256; readonly debugDefaultValue: 256 }
    readonly music_on_chats_catalog_promo_banner_enabled: { readonly code: 43199; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_clear_storage_row_enabled: { readonly code: 43359; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly music_on_chats_geogating_enabled: { readonly code: 36018; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly music_on_chats_internal_acs_enabled: { readonly code: 39208; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_lyrics_word_by_word_offsets_enabled: { readonly code: 40360; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_standalone_producer_enabled: { readonly code: 33470; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_standalone_receiver_enabled: { readonly code: 33469; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_style_lyrics_producer_enabled: { readonly code: 38969; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_style_lyrics_receiver_enabled: { readonly code: 38968; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_style_message_bubble_producer_enabled: { readonly code: 38967; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly music_on_chats_style_message_bubble_receiver_enabled: { readonly code: 38966; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly native_contact_companion_change_enabled: { readonly code: 7301; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly native_contact_companion_nux_learn_more_article_id: { readonly code: 11644; readonly type: "string"; readonly defaultValue: "1191526044909364"; readonly debugDefaultValue: "1191526044909364" }
    readonly native_flow_response_message_params_json_max_size: { readonly code: 32367; readonly type: "int"; readonly defaultValue: 262144; readonly debugDefaultValue: 262144 }
    readonly native_lib_sandboxing_enable_libwebp: { readonly code: 26414; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly new_chat_msg_capping_first_warning_threshold_percentage: { readonly code: 18967; readonly type: "int"; readonly defaultValue: 50; readonly debugDefaultValue: 50 }
    readonly new_end_call_survey_pop_up_user_interval_s: { readonly code: 2553; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly newsletter_admin_invite_nux_id: { readonly code: 15256; readonly type: "string"; readonly defaultValue: "20610220"; readonly debugDefaultValue: "20610220" }
    readonly newsletter_admin_invite_tos_id: { readonly code: 6498; readonly type: "string"; readonly defaultValue: "20610101"; readonly debugDefaultValue: "20610101" }
    readonly newsletter_admin_invite_tos_id_smb_web: { readonly code: 6536; readonly type: "string"; readonly defaultValue: "20610104"; readonly debugDefaultValue: "20610104" }
    readonly newsletter_creation_nux_id: { readonly code: 3835; readonly type: "string"; readonly defaultValue: "20601218"; readonly debugDefaultValue: "20601218" }
    readonly newsletter_creation_tos_id: { readonly code: 3834; readonly type: "string"; readonly defaultValue: "20601217"; readonly debugDefaultValue: "20601217" }
    readonly newsletter_creation_tos_id_smb_web: { readonly code: 5598; readonly type: "string"; readonly defaultValue: "20601217"; readonly debugDefaultValue: "20601217" }
    readonly newsletter_forward_counter_bump_forwards_to_self: { readonly code: 22204; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly newsletter_forward_counter_bump_own_channel_updates_fowards: { readonly code: 22203; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly newsletter_forward_counter_bump_second_order_forwards: { readonly code: 22205; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly newsletter_forward_counter_infra_enabled: { readonly code: 19889; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly newsletter_forward_counter_max_send_after_random_time: { readonly code: 22206; readonly type: "int"; readonly defaultValue: 3600; readonly debugDefaultValue: 60 }
    readonly newsletter_forward_counter_ui_enabled: { readonly code: 19888; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly newsletter_nux_notice_id: { readonly code: 15255; readonly type: "string"; readonly defaultValue: "20610210"; readonly debugDefaultValue: "20610210" }
    readonly newsletter_rcat_field_generating_enabled: { readonly code: 19303; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly newsletter_tos_notice_id: { readonly code: 3810; readonly type: "string"; readonly defaultValue: "20601216"; readonly debugDefaultValue: "20601216" }
    readonly newsletter_tos_notice_id_smb_web: { readonly code: 5597; readonly type: "string"; readonly defaultValue: "20601216"; readonly debugDefaultValue: "20601216" }
    readonly newsletters_video_playback_wabba_logging_enabled: { readonly code: 13954; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly no_large_emoji_regex: { readonly code: 29172; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly non_wa_contact_invite_cta_enabled: { readonly code: 27217; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly notification_highlight_group_size_threshold: { readonly code: 11891; readonly type: "int"; readonly defaultValue: 130; readonly debugDefaultValue: 130 }
    readonly num_days_before_device_expiry_check: { readonly code: 731; readonly type: "int"; readonly defaultValue: 7; readonly debugDefaultValue: 7 }
    readonly num_days_key_index_list_expiration: { readonly code: 730; readonly type: "int"; readonly defaultValue: 35; readonly debugDefaultValue: 35 }
    readonly ohai_request_kb_size: { readonly code: 12248; readonly type: "float"; readonly defaultValue: 20; readonly debugDefaultValue: 20 }
    readonly optimized_delivery_block_and_report_entry_points_allowlist_web: { readonly code: 18736; readonly type: "string"; readonly defaultValue: "4,10,12,13,14,15,17,18,24,31,32,33,34,35,36,39,40,45"; readonly debugDefaultValue: "4,10,12,13,14,15,17,18,24,31,32,33,34,35,36,39,40,45" }
    readonly optimized_delivery_multiple_collection_windows_enabled: { readonly code: 14588; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly optimized_delivery_signal_collection_config: { readonly code: 10302; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly optimized_delivery_signal_collection_enabled: { readonly code: 9348; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly optimized_delivery_signal_collection_on_companions_enabled: { readonly code: 15884; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly optimized_delivery_tokens_storage_config: { readonly code: 10303; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly opus_admin: { readonly code: 30454; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly opus_enabled: { readonly code: 27278; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly opus_t: { readonly code: 27803; readonly type: "int"; readonly defaultValue: 2147483647; readonly debugDefaultValue: 2147483647 }
    readonly order_details_custom_item_enabled: { readonly code: 1176; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly order_details_from_cart_enabled: { readonly code: 1107; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly order_details_from_catalog_enabled: { readonly code: 1212; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly order_details_payment_instructions_sync_enabled: { readonly code: 6670; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly order_details_quick_pay: { readonly code: 1600; readonly type: "string"; readonly defaultValue: "{\"allowed_product_type\":\"none\"}"; readonly debugDefaultValue: "{\"allowed_product_type\":\"none\"}" }
    readonly order_details_total_maximum_value: { readonly code: 1684; readonly type: "float"; readonly defaultValue: 500000000; readonly debugDefaultValue: 500000000 }
    readonly order_details_total_order_minimum_value: { readonly code: 1719; readonly type: "float"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly order_management_enabled: { readonly code: 1188; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly order_messages_ephemeral_exception_enabled: { readonly code: 3240; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly order_statuses_revamp_m1_enabled: { readonly code: 5770; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly orders_deprecation_exposure: { readonly code: 40368; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly orders_expansion_receiver_countries_allowed: { readonly code: 3690; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly original_quality_image_min_edge: { readonly code: 3068; readonly type: "int"; readonly defaultValue: 2560; readonly debugDefaultValue: 2560 }
    readonly otp_lid_migration_enabled: { readonly code: 12553; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly out_contact_invites_enabled: { readonly code: 28170; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly out_of_sync_disappearing_messages_logging: { readonly code: 2561; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly overscroll_logo_enabled: { readonly code: 37770; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly overscroll_logo_theme: { readonly code: 39075; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly p2b_calling_availability_experiment_enabled: { readonly code: 31098; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly p2m_external_payments_link_enabled: { readonly code: 4295; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly p2p_pills_allowlist: { readonly code: 29554; readonly type: "string"; readonly defaultValue: "[{ \"business_id\": \"34666845417\", \"pills\": [\"CHAT\", \"PROFILE\", \"BOOK_APPOINTMENT\", \"CATALOG\", \"BESTSELLERS\", \"OFFERS\", \"ABOUT_US\"] }]"; readonly debugDefaultValue: "[{ \"business_id\": \"34666845417\", \"pills\": [\"CHAT\", \"PROFILE\", \"BOOK_APPOINTMENT\", \"CATALOG\", \"BESTSELLERS\", \"OFFERS\", \"ABOUT_US\"] }]" }
    readonly p2p_pills_allowlist_entries: { readonly code: 29708; readonly type: "string"; readonly defaultValue: "{ \"entries\": [{ \"business_id\": \"34666845417\", \"pills\": [\"CHAT\", \"PROFILE\", \"ABOUT_US\"] }]}"; readonly debugDefaultValue: "{ \"entries\": [{ \"business_id\": \"34666845417\", \"pills\": [\"CHAT\", \"PROFILE\", \"ABOUT_US\"] }]}" }
    readonly p2p_pills_auto_send_messages: { readonly code: 30208; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly p2p_pills_contact_share_receiver_enabled: { readonly code: 36838; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly p2p_pills_contact_share_sender_enabled: { readonly code: 36837; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly p2p_pills_enabled: { readonly code: 27959; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly p2p_pills_enabled_for_ineligible_contacts: { readonly code: 29715; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly p2p_pills_entries: { readonly code: 31469; readonly type: "string"; readonly defaultValue: "{\"enabled_for\": {\"sender\": true,\"receiver\": true},\"enabled_on\": {\"contact_card\": true,\"p2p_link\": true,\"phone_number\": true,\"username\": true}}"; readonly debugDefaultValue: "{\"enabled_for\": {\"sender\": true,\"receiver\": true},\"enabled_on\": {\"contact_card\": true,\"p2p_link\": true,\"phone_number\": true,\"username\": true}}" }
    readonly p2p_pills_entries_enabled: { readonly code: 31471; readonly type: "string"; readonly defaultValue: "{\"enabled_for\": {\"sender\": true,\"receiver\": true},\"enabled_on\": {\"contact_card\": true,\"p2p_link\": true,\"phone_number\": true,\"username\": true}}"; readonly debugDefaultValue: "{\"enabled_for\": {\"sender\": true,\"receiver\": true},\"enabled_on\": {\"contact_card\": true,\"p2p_link\": true,\"phone_number\": true,\"username\": true}}" }
    readonly p2p_pills_graphql_enabled: { readonly code: 30629; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly p2p_pills_max_wait_on_contact_card_send: { readonly code: 30943; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly p2p_pills_new_business_metadata_enabled: { readonly code: 30578; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly paa_support_for_disabled_epehemerality: { readonly code: 21235; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly parent_group_admins_limit: { readonly code: 1655; readonly type: "int"; readonly defaultValue: 20; readonly debugDefaultValue: 20 }
    readonly parent_group_allow_member_suggest_existing_m3_receiver: { readonly code: 5078; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly parent_group_allow_member_suggest_existing_m3_sender: { readonly code: 5077; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly parent_group_announcement_comments_history_sync_receiver_enabled: { readonly code: 5813; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly parent_group_create_privacy: { readonly code: 2356; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly parent_group_link_limit: { readonly code: 1238; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly parent_group_link_limit_community_creation: { readonly code: 1990; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 20 }
    readonly parent_group_min_participants_for_group_entry_point: { readonly code: 2382; readonly type: "int"; readonly defaultValue: 20; readonly debugDefaultValue: 1 }
    readonly parent_group_subgroup_filter: { readonly code: 3147; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly parent_group_view_enabled: { readonly code: 982; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly parent_group_view_enabled_for_smb_on_web: { readonly code: 2205; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly parse_encrypted_dsm_msg_fix: { readonly code: 26772; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payment_br_holdout: { readonly code: 14358; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payment_integrity_friction_p2m_upr_copy_enabled: { readonly code: 34874; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payment_integrity_friction_p2m_upr_enabled: { readonly code: 35286; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payment_link_trace_id_logging_enabled: { readonly code: 19440; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payment_links_psp_logo_allowlist: { readonly code: 40482; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{\"mercadopago\":[\"og_image\",\"resource\"],\"stone\":[\"og_image\",\"resource\"]}" }
    readonly payment_links_psp_logo_urls: { readonly code: 43405; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly payment_links_trust_signals_metatag_enabled: { readonly code: 16866; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payment_links_trust_signals_metatag_psp_list: { readonly code: 17162; readonly type: "string"; readonly defaultValue: "{\"psp\":[\"mercadopago\"]} "; readonly debugDefaultValue: "{\"psp\":[\"mercadopago\"]} " }
    readonly payment_links_trust_signals_other_metatag_kill_switch_enabled: { readonly code: 24662; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payment_links_trust_signals_other_metatags_enabled: { readonly code: 17355; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payment_support_lids: { readonly code: 14333; readonly type: "string"; readonly defaultValue: "116664750354676,128385682505839,46635358933114,26521959944357,200206125658243,179985503506636,187797998674170,228746200088715,117914552262794,10158134550607"; readonly debugDefaultValue: "116664750354676,128385682505839,46635358933114,26521959944357,200206125658243,179985503506636,187797998674170,228746200088715,117914552262794,10158134550607" }
    readonly payments_br_content_optimization_variant: { readonly code: 4248; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly payments_br_copy_pix_code_api_merchant_enabled: { readonly code: 9017; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_br_force_copy_pix_cta_enabled: { readonly code: 8953; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_br_p2m_boleto_enabled: { readonly code: 11671; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_br_p2m_buyer_logging_phase_2: { readonly code: 29803; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_br_p2m_completed_payment_intent_buyer_logging: { readonly code: 27095; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2m_copy_boleto_code_buyer_logging: { readonly code: 27096; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2m_order_details_buyer_logging: { readonly code: 27008; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2m_pay_now_buyer_logging: { readonly code: 27092; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2m_pix_copy_code_buyer_logging: { readonly code: 27028; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2m_pix_copy_key_buyer_logging: { readonly code: 27026; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2m_pix_more_ways_to_pay_buyer_logging: { readonly code: 27094; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2m_view_order_buyer_logging: { readonly code: 27093; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2p_pix_copy_code_buyer_logging: { readonly code: 27114; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_p2p_pix_copy_key_buyer_logging: { readonly code: 26847; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_payment_links_buyer_logging: { readonly code: 27027; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_br_pix_on_web: { readonly code: 16156; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_br_pix_phase_1_seller_sync_enabled: { readonly code: 7024; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_br_pix_quick_reply_enabled: { readonly code: 7857; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_br_pix_web_attachment_tray: { readonly code: 19276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_link_to_lite_consumer_enabled: { readonly code: 3051; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_merchant_global_orders_value_props_banner_enabled: { readonly code: 3744; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_receipt_and_state_bubble_version: { readonly code: 41745; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly payments_receipt_and_state_copy_pix_code_p2m: { readonly code: 36811; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_receipt_and_state_copy_pix_code_p2p: { readonly code: 37638; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_receipt_and_state_copy_pix_key_p2m: { readonly code: 36796; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_receipt_and_state_copy_pix_key_p2p: { readonly code: 36791; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_receipt_and_state_details_kill_switch: { readonly code: 37686; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_receipt_and_state_hide_bubble_add_receipt: { readonly code: 41705; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_receipt_and_state_web_state_hide_kill_switch: { readonly code: 37818; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly payments_row_upr_buyer_logging: { readonly code: 35965; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_algeria_enabled: { readonly code: 35026; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_angola_enabled: { readonly code: 35054; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_argentina_enabled: { readonly code: 33887; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_bahrain_enabled: { readonly code: 35055; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_benin_enabled: { readonly code: 35056; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_bolivia_enabled: { readonly code: 36028; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_bubble_countries: { readonly code: 29342; readonly type: "string"; readonly defaultValue: "MX, ID, HK, TW, AE, EG, TR, AR, CA, CO, PE, SA, ZA, GH, ET, TZ, CI, DZ, AO, BH, BJ, BF, CM, CR, CD, DJ, SV, JO, KW, MR, MA, MZ, OM, PA, QA, SN, SL, TG, TN, GT, IQ, BO, CL, DO, EC, HN, NI, PY, UY, LB, LY, ML"; readonly debugDefaultValue: "MX, ID, HK, TW, AE, EG, TR, AR, CA, CO, PE, SA, ZA, GH, ET, TZ, CI, DZ, AO, BH, BJ, BF, CM, CR, CD, DJ, SV, JO, KW, MR, MA, MZ, OM, PA, QA, SN, SL, TG, TN, GT, IQ, BO, CL, DO, EC, HN, NI, PY, UY, LB, LY, ML" }
    readonly payments_upr_bubble_layout_v2_enabled: { readonly code: 41391; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_burkina_faso_enabled: { readonly code: 35057; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_cameroon_enabled: { readonly code: 34981; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_canada_enabled: { readonly code: 33888; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_chile_enabled: { readonly code: 36352; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_colombia_enabled: { readonly code: 33889; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_confirm_reminder_delay_minutes: { readonly code: 40882; readonly type: "int"; readonly defaultValue: 240; readonly debugDefaultValue: 1 }
    readonly payments_upr_confirmation_countries: { readonly code: 39301; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "ID" }
    readonly payments_upr_confirmation_receive_enabled: { readonly code: 41132; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_costa_rica_enabled: { readonly code: 35058; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_cote_divoire_enabled: { readonly code: 33894; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_custom_payment_methods_sync_countries: { readonly code: 30647; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: " MX, ID, HK, TW, AE, EG, TR" }
    readonly payments_upr_djibouti_enabled: { readonly code: 35060; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_dominican_republic_enabled: { readonly code: 36353; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_dr_congo_enabled: { readonly code: 35059; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_ecuador_enabled: { readonly code: 36354; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_egypt_enabled: { readonly code: 31870; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_el_salvador_enabled: { readonly code: 35061; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_ethiopia_enabled: { readonly code: 33892; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_ghana_enabled: { readonly code: 33891; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_guatemala_enabled: { readonly code: 35584; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_honduras_enabled: { readonly code: 36355; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_hongkong_enabled: { readonly code: 31868; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_id_enabled: { readonly code: 32170; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_iraq_enabled: { readonly code: 35585; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_jordan_enabled: { readonly code: 34982; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_kuwait_enabled: { readonly code: 35062; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_lebanon_enabled: { readonly code: 36359; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_libya_enabled: { readonly code: 36360; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_mali_enabled: { readonly code: 36361; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_mauritania_enabled: { readonly code: 35572; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_mexico_wallet_enabled: { readonly code: 32043; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_morocco_enabled: { readonly code: 35573; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_mozambique_enabled: { readonly code: 35575; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_multiple_key_copy_enabled: { readonly code: 32124; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_mx_enabled: { readonly code: 32169; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_nicaragua_enabled: { readonly code: 36356; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_oman_enabled: { readonly code: 35576; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_panama_enabled: { readonly code: 35577; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_paraguay_enabled: { readonly code: 36357; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_peru_enabled: { readonly code: 33890; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_qatar_enabled: { readonly code: 35578; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_saudi_arabia_enabled: { readonly code: 33886; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_send_key_from_web: { readonly code: 32826; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: " MX, ID, HK, TW, AE, EG, TR" }
    readonly payments_upr_senegal_enabled: { readonly code: 35579; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_sierra_leone_enabled: { readonly code: 35580; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_south_africa_enabled: { readonly code: 33922; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_taiwan_enabled: { readonly code: 31869; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_tanzania_enabled: { readonly code: 33893; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_togo_enabled: { readonly code: 35581; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_tunisia_enabled: { readonly code: 35583; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_turkey_enabled: { readonly code: 31848; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_uae_enabled: { readonly code: 31860; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly payments_upr_uruguay_enabled: { readonly code: 36358; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly peer_message_lid_migration_outgoing: { readonly code: 24184; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pending_group_requests_persistent_banner: { readonly code: 20545; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly per_customer_data_sharing_controls_eligible: { readonly code: 13383; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly phone_number_sharing_flow: { readonly code: 15653; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly pibx_max_fave_chats_in_imp_list: { readonly code: 38169; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly pibx_vip_max_fave_list_len: { readonly code: 38109; readonly type: "int"; readonly defaultValue: 20; readonly debugDefaultValue: 20 }
    readonly pinned_message_banner_notch_animation_enabled: { readonly code: 34369; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly pinned_messages_infinite_receiver_enabled: { readonly code: 31886; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly pinned_messages_infinite_sender_enabled: { readonly code: 31887; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly pinned_messages_m0: { readonly code: 3138; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly pinned_messages_m1_receiver: { readonly code: 3139; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly pinned_messages_m1_sender: { readonly code: 3140; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly pinned_messages_m2: { readonly code: 3141; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pinned_messages_m2_image_thumbnail: { readonly code: 7467; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pinned_messages_m2_pin_max: { readonly code: 3732; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly pinned_messages_remove_30_day_pins: { readonly code: 37344; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly pinned_messages_sender_short_expiry_durations_enabled: { readonly code: 4432; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pix_onboarding_new_content_enabled: { readonly code: 23953; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pix_payment_request_web_enabled: { readonly code: 34199; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly placeholder_message_key_hash_logging: { readonly code: 2639; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly placeholder_message_resend: { readonly code: 3579; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly placeholder_message_resend_maximum_days_limit: { readonly code: 3639; readonly type: "int"; readonly defaultValue: 14; readonly debugDefaultValue: 14 }
    readonly pnh_cag_disable_polls_group_size: { readonly code: 5056; readonly type: "int"; readonly defaultValue: 10000; readonly debugDefaultValue: 10000 }
    readonly pnh_cag_disable_reactions_group_size: { readonly code: 4495; readonly type: "int"; readonly defaultValue: 10000; readonly debugDefaultValue: 10000 }
    readonly pnh_history_sync_force_general: { readonly code: 28664; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly pnh_pn_for_lid_chat_sync: { readonly code: 3062; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly pnh_thread_promotion_to_general_lid: { readonly code: 16632; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_add_option_creator_enabled: { readonly code: 35771; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_add_option_enabled: { readonly code: 24517; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_add_option_participant_enabled: { readonly code: 35677; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_add_option_receiving_enabled: { readonly code: 25758; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly poll_add_option_revoke_receiving_version: { readonly code: 37910; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly poll_cleanup_days: { readonly code: 1410; readonly type: "int"; readonly defaultValue: 31; readonly debugDefaultValue: 31 }
    readonly poll_creation_cag_enabled: { readonly code: 2738; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_creator_edit_enabled: { readonly code: 24887; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_creator_edit_option_removal_enabled: { readonly code: 37731; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_creator_edit_receiving_version: { readonly code: 24886; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly poll_creator_remove_added_option_enabled: { readonly code: 37732; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_enable_static_add_option_msg: { readonly code: 41785; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_end_time_enabled: { readonly code: 24405; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_end_time_receiving_enabled: { readonly code: 24884; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_failure_recovery_version: { readonly code: 41828; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly poll_hide_voters_enabled: { readonly code: 24518; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_hide_voters_receiving_enabled: { readonly code: 24885; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly poll_name_length: { readonly code: 1406; readonly type: "int"; readonly defaultValue: 255; readonly debugDefaultValue: 255 }
    readonly poll_option_count: { readonly code: 1408; readonly type: "int"; readonly defaultValue: 12; readonly debugDefaultValue: 12 }
    readonly poll_option_length: { readonly code: 1407; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly poll_option_replay_retention_days: { readonly code: 42973; readonly type: "int"; readonly defaultValue: 31; readonly debugDefaultValue: 31 }
    readonly poll_participant_remove_added_option_enabled: { readonly code: 37734; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_receiving_cag_enabled: { readonly code: 2737; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_relaxed_option_count_receiving_enabled: { readonly code: 37909; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_result_snapshot_polltype_envelope_enabled: { readonly code: 12258; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_tc_cleanup_cron_enabled: { readonly code: 32038; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_tc_receiving_enabled: { readonly code: 31592; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_tc_sending_enabled: { readonly code: 31593; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pq_1on1_message_enabled: { readonly code: 24160; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pq_1on1_messaging_killswitch: { readonly code: 35210; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pq_batch_upload_size: { readonly code: 21201; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly pq_keys_upload: { readonly code: 21198; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pq_max_keys_on_server: { readonly code: 21200; readonly type: "int"; readonly defaultValue: 200; readonly debugDefaultValue: 200 }
    readonly pq_session_upgrade_max_devices_per_period: { readonly code: 35305; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly pq_session_upgrade_period_days: { readonly code: 35744; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly pre_call_logging_enabled: { readonly code: 37184; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly prefer_lid_for_chatd_login: { readonly code: 19191; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly premium_blue_enabled: { readonly code: 5318; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly premium_broadcast_smb_capping_enabled: { readonly code: 13808; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly premium_msg_bb_campaign_sync_enabled: { readonly code: 29650; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly primary_initiated_companion_contact_refresh: { readonly code: 33013; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_screen_enabled: { readonly code: 26820; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_settings_about_lid_migration_enable: { readonly code: 16195; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_settings_group_add_lid_migration_enable: { readonly code: 16274; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_settings_presence_lid_migration_enable: { readonly code: 16275; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_settings_profile_lid_migration_enable: { readonly code: 16161; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_tips_groups_build: { readonly code: 3995; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_tips_killswitch: { readonly code: 4314; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_tips_profile_build: { readonly code: 3998; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_token_sending_on_all_1_on_1_messages: { readonly code: 10518; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_token_sending_on_group_create: { readonly code: 11261; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly privacy_token_sending_on_group_participant_add: { readonly code: 11262; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly private_messaging_uk_osa_enabled: { readonly code: 14250; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly private_osa_reporting_enabled: { readonly code: 12990; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly profile_picture_deeplink_enabled: { readonly code: 7634; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly profile_scraping_privacy_token_in_about_iq: { readonly code: 9668; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly profile_scraping_privacy_token_in_about_usync: { readonly code: 20798; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ptt_user_journey_logging_wam_enabled: { readonly code: 8630; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ptv_autoplay_enabled: { readonly code: 3482; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly ptv_autoplay_loop_limit: { readonly code: 3483; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly ptv_forwarding_to_status_enabled: { readonly code: 42769; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ptv_max_duration_seconds: { readonly code: 3356; readonly type: "int"; readonly defaultValue: 60; readonly debugDefaultValue: 60 }
    readonly ptv_quoted_replies_cutout_enabled: { readonly code: 30384; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly public_bug_reporting_sidebar: { readonly code: 19124; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pushname_blocklist_starting_with_at: { readonly code: 18097; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly qp_banner_sticker_animation_enabled: { readonly code: 31213; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly qp_campaign_client_enabled: { readonly code: 3536; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly quoted_message_user_journey_logging_enabled: { readonly code: 15694; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rasterize_text_status_pixel_width: { readonly code: 13460; readonly type: "int"; readonly defaultValue: 1080; readonly debugDefaultValue: 1080 }
    readonly reaction_user_journey_logging_enabled: { readonly code: 10438; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly reactions_alignment_for_transparent_messages_enabled: { readonly code: 16792; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly reactions_receiver_enabled: { readonly code: 13542; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly receipt_mode_bitmask_enabled: { readonly code: 30084; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly recommended_channels_background_refresh: { readonly code: 4309; readonly type: "int"; readonly defaultValue: 14400000; readonly debugDefaultValue: 14400000 }
    readonly refresh_group_info_on_mismatch: { readonly code: 35119; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly relax_integrity_constraints_for_bb_wa_tenured_accounts: { readonly code: 28516; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly remove_pn_dependencies: { readonly code: 26888; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly render_updated_disclosure: { readonly code: 14407; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly report_block_improvements_for_groups_enabled: { readonly code: 8327; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly report_call_replayer_id: { readonly code: 1834; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly report_to_admin_enabled: { readonly code: 3696; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly report_to_admin_kill_switch: { readonly code: 3695; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly retry_receipt_new_session_enabled: { readonly code: 35926; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly reuse_cached_certs_for_data_channel: { readonly code: 12913; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly reveal_username_non_linking_rejection_reason_enabled: { readonly code: 32910; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly rich_format_logging_enabled: { readonly code: 29428; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rich_order_status_wa_web: { readonly code: 16534; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rnr_days_cooldown: { readonly code: 18703; readonly type: "int"; readonly defaultValue: 100000; readonly debugDefaultValue: 100000 }
    readonly row_buyer_order_revamp_m0_enabled: { readonly code: 4893; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly rt_clean_reporting_tag: { readonly code: 6723; readonly type: "int"; readonly defaultValue: 31; readonly debugDefaultValue: 31 }
    readonly rt_clean_reporting_token: { readonly code: 9567; readonly type: "int"; readonly defaultValue: 31; readonly debugDefaultValue: 31 }
    readonly rt_edit_receive: { readonly code: 15016; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly rt_ghs_receiver_enabled: { readonly code: 24742; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly rt_ghs_sender_enabled: { readonly code: 24741; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly rt_message_drop_when_invalid: { readonly code: 18397; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rt_receive_reporting_tag: { readonly code: 5718; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly rt_receiver_dual_encrypted_msg_enabled: { readonly code: 15258; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly rt_receiver_missing_reporting_token_detection: { readonly code: 36374; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly rt_report_token_from_inclusion_list: { readonly code: 9818; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rt_sender_dual_encrypted_msg_enabled: { readonly code: 12623; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly rt_sender_reporting_token_version: { readonly code: 8860; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly rt_sender_v3_hybrid_mode: { readonly code: 36372; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rt_swapped_fallback_validation: { readonly code: 21718; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly rt_sync_reporting_tag: { readonly code: 6578; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly rt_web_delay_processing: { readonly code: 15181; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly rust_accel_wacall_foundation_enabled: { readonly code: 33446; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rust_sandbox_enable_libwebp: { readonly code: 42618; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rx_video_enhance_max_short_edge_px: { readonly code: 36517; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly rx_video_enhance_sharpen_strength_x1000: { readonly code: 36510; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly saga_copy: { readonly code: 7044; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly saga_enabled: { readonly code: 5626; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly saga_message_feedback_using_canonical_ent: { readonly code: 23328; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly saga_protobuf_ai_stardust_web: { readonly code: 11756; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly saga_protobuf_show_sysmsg_web: { readonly code: 11832; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly saga_v1_carousel: { readonly code: 10609; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly saga_v1_enabled: { readonly code: 9942; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly saga_v1_nux_enabled: { readonly code: 9944; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly saga_v1_reengagement_enabled: { readonly code: 9924; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly schedule_call_show_join_button_time_interval_mins: { readonly code: 16253; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly schedule_call_show_upcoming_banner_time_interval_mins: { readonly code: 16254; readonly type: "int"; readonly defaultValue: 1440; readonly debugDefaultValue: 1440 }
    readonly scheduled_messages_photo_video_sender_enabled: { readonly code: 32553; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly scheduled_messages_receiver_enabled: { readonly code: 24610; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly scheduled_messages_sender_enabled: { readonly code: 23845; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly scheduled_messages_smart_defaults: { readonly code: 36583; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly scheduled_messages_window_duration_max_seconds: { readonly code: 26347; readonly type: "int"; readonly defaultValue: 1209600; readonly debugDefaultValue: 1209600 }
    readonly scheduled_messages_window_duration_min_seconds: { readonly code: 26348; readonly type: "int"; readonly defaultValue: 600; readonly debugDefaultValue: 600 }
    readonly screening_audio_hint_enabled: { readonly code: 34019; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly screening_audio_hint_supported_locales: { readonly code: 34053; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly search_the_web_design_experiment_v1: { readonly code: 15423; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly search_the_web_dialog_redesign: { readonly code: 8171; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly search_the_web_image_search: { readonly code: 9547; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly search_the_web_text_search: { readonly code: 9548; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly search_the_web_url_offer: { readonly code: 8473; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly search_user_journey_logging_wam_enabled: { readonly code: 14682; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly security_fixes_bitmap: { readonly code: 3094; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly seller_orders_management_revamp: { readonly code: 5190; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly send_cag_member_revokes_as_GDM: { readonly code: 3069; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly send_extended_nack_enabled: { readonly code: 3280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly server_driven_copy_m2: { readonly code: 30492; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly server_sent_invites_for_groups_web_enabled: { readonly code: 37630; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly server_sent_invites_web_enabled: { readonly code: 37278; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly service_improvement_opt_out_flag: { readonly code: 3664; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly settings_sync_enabled: { readonly code: 22692; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sfu_secondary_remote_bwe_impl: { readonly code: 11472; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 8 }
    readonly share_own_pn_sync: { readonly code: 3070; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly share_phone_number_on_cart_send_to_direct_connection_biz_enabled: { readonly code: 1867; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly shimmed_links_in_the_marketing_message_body_enabled: { readonly code: 12995; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly shortcake_companion_prologue__passkeys__assertion_timeout_seconds: { readonly code: 30661; readonly type: "int"; readonly defaultValue: 600; readonly debugDefaultValue: 600 }
    readonly shortcake_companion_prologue__passkeys__enabled: { readonly code: 29206; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly shortcake_companion_prologue__passkeys__handoff_enabled: { readonly code: 29204; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly shortcake_companion_prologue__passkeys__request_options_ttl_seconds: { readonly code: 30662; readonly type: "int"; readonly defaultValue: 600; readonly debugDefaultValue: 600 }
    readonly show_fishfooding_toggle_in_bug_reporting_form: { readonly code: 33156; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly show_integrity_screensharing_friction_ui: { readonly code: 16411; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly show_username_non_linking_rejection_reason_enabled: { readonly code: 32920; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly similar_channels_in_channel_details_enabled: { readonly code: 7473; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly similar_channels_in_thread_on_follow_enabled: { readonly code: 7472; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly similar_channels_max_limit: { readonly code: 7559; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly similar_channels_min_limit: { readonly code: 7560; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly single_e2ee_session_migration_state_incoming: { readonly code: 7821; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly single_e2ee_session_migration_state_outgoing: { readonly code: 7820; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly single_emoji_logging_enabled: { readonly code: 9669; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smart_filters_enabled: { readonly code: 1015; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smart_filters_enabled_consumer: { readonly code: 1287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_agent_chat_list_indicator_enabled: { readonly code: 10455; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_agent_thread_control_notification_enabled: { readonly code: 10456; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_ai_agents_web_chat_assignment_interop_enabled: { readonly code: 13387; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_auth_agents_feature_control_enabled: { readonly code: 27585; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_bb_in_thread_insight_metrics_enabled: { readonly code: 31676; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_bb_pro_business_verification: { readonly code: 34341; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_billing_enabled: { readonly code: 1583; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_biz_ai_lists_pills: { readonly code: 28470; readonly type: "string"; readonly defaultValue: "None"; readonly debugDefaultValue: "None" }
    readonly smb_biz_ai_suggested_reply_no_action_threshold: { readonly code: 35652; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly smb_biz_ai_suggested_reply_prefetch_cooldown_min: { readonly code: 35512; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 0 }
    readonly smb_biz_ai_suggested_reply_prefetch_count: { readonly code: 35531; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly smb_biz_profile_custom_url: { readonly code: 2582; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly smb_business_broadcast_import_contact: { readonly code: 17433; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_multi_audience_send_web: { readonly code: 25206; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_pro_account_insights_enabled: { readonly code: 42721; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_pro_duplicate_enabled: { readonly code: 41199; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_pro_enabled: { readonly code: 29033; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_business_broadcast_pro_enabled_no_exp: { readonly code: 38999; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_pro_enabled_with_exposure: { readonly code: 40264; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_business_broadcast_pro_min_audience_recipients: { readonly code: 37761; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 5 }
    readonly smb_business_broadcast_pro_scheduled_sends_enabled: { readonly code: 40893; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_pro_smart_audiences_enabled: { readonly code: 40699; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_business_broadcast_pro_web_scheduled_sends_enabled: { readonly code: 33169; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_send_web: { readonly code: 21508; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_send_web_no_exp: { readonly code: 28138; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_business_broadcast_send_web_smba: { readonly code: 27486; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_business_broadcast_send_web_smba_no_exp: { readonly code: 28139; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_catalog_graphql_get_public_key: { readonly code: 11690; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_catalog_graphql_verify_postcode: { readonly code: 11624; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_catkit_query_version: { readonly code: 1229; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly smb_collections_enabled: { readonly code: 451; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_contact_manager_hidden_contacts_enabled: { readonly code: 35186; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_contact_manager_sublist_enabled: { readonly code: 33708; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_core_biz_profile_ux_refreshed: { readonly code: 19929; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_core_biz_profile_ux_refreshed_v2: { readonly code: 22561; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_core_rec_card: { readonly code: 27568; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_ctwa_billing_enabled: { readonly code: 2158; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_do_label_localize_backfill_enabled_code: { readonly code: 30352; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_do_label_localize_on_create_enabled_code: { readonly code: 30344; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_ecommerce_compliance_india_m4: { readonly code: 1003; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_ecommerce_compliance_india_m4_5: { readonly code: 1192; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_graphql_to_fetch_qp_enabled: { readonly code: 7645; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_graphql_to_fetch_qp_frequency_mins: { readonly code: 7646; readonly type: "int"; readonly defaultValue: 1320; readonly debugDefaultValue: 5 }
    readonly smb_graphql_to_fetch_qp_surface_ids: { readonly code: 7647; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly smb_graphql_token_recovery_during_account_recovery_enabled: { readonly code: 9197; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_hide_unsupported_currency_price: { readonly code: 1203; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_label_sync_critical_event_logging: { readonly code: 24311; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_labels_ctwa_data_sharing: { readonly code: 5009; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_lists_list_details_open_chat_enabled: { readonly code: 42553; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_md_agent_chat_assignment_chats_reorder_on_chat_assignment_enabled: { readonly code: 2787; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_md_agent_chat_assignment_chats_reorder_on_chat_unassignment_enabled: { readonly code: 2788; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_md_agent_chat_assignment_enabled: { readonly code: 1798; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_md_agent_chat_assignment_notifications_enabled: { readonly code: 2908; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_md_agent_chat_assignment_nux_impressions: { readonly code: 2207; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 3 }
    readonly smb_md_agent_chat_assignment_system_messages_logging_v2_enabled: { readonly code: 2709; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_meta_ai_tos_notice_id: { readonly code: 14628; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly smb_meta_verified_context_card: { readonly code: 8313; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_multi_device_agents_logging_V2_enabled: { readonly code: 1897; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_multi_device_message_attribution_enabled: { readonly code: 1981; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_notes_content_max_limit: { readonly code: 10272; readonly type: "int"; readonly defaultValue: 5000; readonly debugDefaultValue: 5000 }
    readonly smb_payment_links_cta_button_kill_switch: { readonly code: 14967; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_payment_links_cta_psp_list: { readonly code: 14998; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly smb_payment_links_cta_variant: { readonly code: 14957; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly smb_payment_links_logging_enabled: { readonly code: 9213; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_payment_links_seller_logging_enabled: { readonly code: 10389; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_payment_links_url_regex_list: { readonly code: 8969; readonly type: "string"; readonly defaultValue: "{}"; readonly debugDefaultValue: "{}" }
    readonly smb_premium_messages_click_logging_enabled: { readonly code: 4657; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_premium_messages_url_cta_alert_dialog_enabled: { readonly code: 5044; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly smb_product_country_of_origin_m1: { readonly code: 13415; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_project_waldo_set_price_tier_biz_profile_enabled: { readonly code: 3467; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_qp_bb_chat_list_banner: { readonly code: 20172; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_qp_bb_chat_list_banner_no_dismiss_cap: { readonly code: 41447; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_qp_emergency_force_fetch_nonce: { readonly code: 27115; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly smb_qp_web_debug_recunit: { readonly code: 31009; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_rambutan_enabled: { readonly code: 3124; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_temp_cover_photo_privacy_messaging: { readonly code: 1913; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_tos_qp_chatlist_banner: { readonly code: 32396; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_waldo_service_offerings_selection_enabled: { readonly code: 3285; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_web_ai_tos_master_notice_id: { readonly code: 34831; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly smb_web_bb_home_qp_surface_enabled: { readonly code: 32613; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_category_search_via_graph_enabled: { readonly code: 28519; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_create_ad_chatlist_qp_dummy_enabled: { readonly code: 37787; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_create_ad_chatlist_qp_enabled: { readonly code: 37785; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_create_ad_chatlist_qp_filter_dummy_enabled: { readonly code: 37789; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_create_ad_chatlist_qp_filter_enabled: { readonly code: 37788; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_customer_management_custom_fields: { readonly code: 36576; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_customer_management_enabled: { readonly code: 26165; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_customer_management_import_export: { readonly code: 36497; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_customer_manager_bulk_edit_enabled: { readonly code: 32550; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_customer_manager_date_range_filter_enabled: { readonly code: 32096; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_customer_manager_export_enabled: { readonly code: 32287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_customer_manager_header_menu_enabled: { readonly code: 33086; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smb_web_customer_manager_nux_debug_tools_enabled: { readonly code: 40896; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_fb_linking: { readonly code: 43576; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_meta_ai_assistant_enabled: { readonly code: 34828; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smb_web_meta_ai_image_input_languages: { readonly code: 34829; readonly type: "string"; readonly defaultValue: " "; readonly debugDefaultValue: "en" }
    readonly smb_web_show_quick_reply_option_in_composer: { readonly code: 31700; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smba_bb_genai_composer_min_words: { readonly code: 21447; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly smba_business_broadcast_genai_custom_user_prompt_enabled: { readonly code: 20464; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly smba_business_broadcast_genai_master_abprop: { readonly code: 22384; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smba_business_broadcast_genai_text: { readonly code: 17743; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smba_business_broadcast_genai_text_max_tries: { readonly code: 20946; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly smba_business_broadcast_genai_text_model: { readonly code: 20929; readonly type: "string"; readonly defaultValue: "LLAMA"; readonly debugDefaultValue: "LLAMA" }
    readonly smba_business_broadcast_recipient_limit: { readonly code: 17937; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly smba_premium_messages_leaving_wa_content: { readonly code: 6693; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly smbi_premium_broadcast_max_recipient_limit: { readonly code: 23857; readonly type: "int"; readonly defaultValue: 256; readonly debugDefaultValue: 500 }
    readonly smbw_business_broadcast_duplicate_enabled: { readonly code: 29021; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly smbw_business_broadcast_smart_column_detection_enabled: { readonly code: 27999; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly snapl_newsletter_logging_encrypted_rid_enabled: { readonly code: 32239; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly snapl_newsletter_logging_media_id_placeholder_string: { readonly code: 14064; readonly type: "string"; readonly defaultValue: "-1"; readonly debugDefaultValue: "-1" }
    readonly snapshot_recovery_max_mutations_count_allowed: { readonly code: 18786; readonly type: "int"; readonly defaultValue: 2000; readonly debugDefaultValue: 2000 }
    readonly soccer_ball_reaction_full_animation_enabled: { readonly code: 27834; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly soccer_reaction_in_tray_enabled: { readonly code: 27833; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sound_stickers_audio_loop_count: { readonly code: 41423; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly sound_stickers_audio_playing_enabled: { readonly code: 36630; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sound_stickers_channels_send_enabled: { readonly code: 40190; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sound_stickers_consumption_enabled: { readonly code: 36628; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sound_stickers_creation_enabled: { readonly code: 36629; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sound_stickers_giphy_clips_enabled: { readonly code: 42276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly spoilers_status_receiver_enabled: { readonly code: 39660; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly spoilers_status_sender_enabled: { readonly code: 39659; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly start_chat_context_request_timeout_ms: { readonly code: 20199; readonly type: "int"; readonly defaultValue: 500; readonly debugDefaultValue: 500 }
    readonly status_allow_forwarding_to_status_on_web: { readonly code: 17071; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_archive_refetch_old_music_artwork_enabled: { readonly code: 37213; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_chain_from_cl_mode: { readonly code: 27343; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly status_chain_from_my_interaction_limit: { readonly code: 27011; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly status_companion_read_sync_fix_enabled: { readonly code: 39224; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_e2ee_recv_over_status_stanza: { readonly code: 27622; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_e2ee_send_over_status_stanza: { readonly code: 27620; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_full_my_status_header_is_posting_entrypoint_enabled: { readonly code: 38719; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_future_proofing: { readonly code: 9522; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_infra_1_1_session_split: { readonly code: 25034; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly status_likes_fifa_lottie_full_screen_animation_enabled: { readonly code: 27054; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_mentions_group_mention_receiver: { readonly code: 12254; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly status_mentions_receiver: { readonly code: 7869; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_notify_broadcast_addressing_enabled: { readonly code: 40773; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_player_avatar_status_creation_entrypoint: { readonly code: 30912; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly status_pog_id_rotation_window_days: { readonly code: 18297; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly status_poster_side_gating_enabled: { readonly code: 8742; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly status_reaction_emojis: { readonly code: 1852; readonly type: "string"; readonly defaultValue: "[128525, 128514, 128558, 128546, 128591, 128079, 127881, 128175]"; readonly debugDefaultValue: "[128525, 128514, 128558, 128546, 128591, 128079, 127881, 128175]" }
    readonly status_save_to_camera_roll_enabled: { readonly code: 13280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly status_session_split_scoped_recovery_enabled: { readonly code: 41950; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly status_video_max_duration: { readonly code: 175; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly status_video_playback_max_duration_second: { readonly code: 7902; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly status_viewer_action_psa_link_click_logging_enabled: { readonly code: 34489; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly status_vsr_model: { readonly code: 39804; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly status_web_vpv_impression_snapshot_fix_enabled: { readonly code: 42817; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly sticker_discovery_enabled_m1: { readonly code: 7640; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sticker_non_square_max_aspect_ratio: { readonly code: 39382; readonly type: "float"; readonly defaultValue: 1; readonly debugDefaultValue: 1.5 }
    readonly sticker_non_square_rendering_enabled: { readonly code: 37618; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly sticker_non_square_sending_enabled: { readonly code: 39526; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sticker_store_testing_enabled: { readonly code: 25639; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sticker_suggestion_emoji_group_update_enabled: { readonly code: 42203; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sticker_suggestion_enabled: { readonly code: 41093; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly stickers_emoji_tagging_enabled: { readonly code: 26465; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly sticky_chat_profile_picture_enabled: { readonly code: 13692; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly suggested_audiences_wa_web: { readonly code: 26207; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly support_contact_form_using_graphql: { readonly code: 26001; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly support_email_contact_form_logged_in_enabled: { readonly code: 33263; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly support_lids: { readonly code: 14317; readonly type: "string"; readonly defaultValue: "4200746488034,30563255730192,70334669676777,19349129719984,66065505775654,133814269518032,243799792062487,7323238039569,269290422947912,261718412386336,4351103873168,12391299473616,92410801582180,277730033709185,36090878648473,79882365190287,94274800595104,117794058317863,115784047153172,179250745360524,7301780005088,166653589463190,94249030815912,198964645236955,198427807899653,23656948363422,255735573270728,106670109786240,130932396826763,18855208456329"; readonly debugDefaultValue: "4200746488034,30563255730192,70334669676777,19349129719984,66065505775654,133814269518032,243799792062487,7323238039569,269290422947912,261718412386336,4351103873168,12391299473616,92410801582180,277730033709185,36090878648473,79882365190287,94274800595104,117794058317863,115784047153172,179250745360524,7301780005088,166653589463190,94249030815912,198964645236955,198427807899653,23656948363422,255735573270728,106670109786240,130932396826763,18855208456329" }
    readonly support_message_feedback_enabled: { readonly code: 7080; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly support_wass_chat_auth_refresh_enabled: { readonly code: 42420; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly supports_keep_in_chat_in_cag: { readonly code: 2844; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly syncd_additional_mutations_count: { readonly code: 2777; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly syncd_inline_mutations_max_count: { readonly code: 14494; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly syncd_key_max_use_days: { readonly code: 14488; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly syncd_lthash_consistency_check_on_snapshot_mac_mismatch: { readonly code: 1783; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly syncd_mutation_and_bundle_logging: { readonly code: 11821; readonly type: "string"; readonly defaultValue: "{\"allowlist\": []}"; readonly debugDefaultValue: "{\"allowlist\": []}" }
    readonly syncd_no_retry_on_resource_limit_enabled: { readonly code: 42960; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly syncd_patch_protobuf_max_size: { readonly code: 14495; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly syncd_periodic_sync_days: { readonly code: 1400; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly syncd_sentinel_timeout_seconds: { readonly code: 14485; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly syncd_use_index_for_lthash_lookup: { readonly code: 28144; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly syncd_wait_for_key_timeout_days: { readonly code: 14492; readonly type: "int"; readonly defaultValue: 7; readonly debugDefaultValue: 7 }
    readonly synced_message_keys_processing_type: { readonly code: 22825; readonly type: "string"; readonly defaultValue: "control"; readonly debugDefaultValue: "control" }
    readonly system_msg_numbers_fb_branded: { readonly code: 1035; readonly type: "string"; readonly defaultValue: "16325551023,16505434800,16503130062,16507885324,16508620604,16504228206,447710173736,16315551023,16505361212,16508129150,16315555102,16315558723,16505212669,16507885280,19032707825,0"; readonly debugDefaultValue: "16325551023,16505434800,16503130062,16507885324,16508620604,16504228206,447710173736,16315551023,16505361212,16508129150,16315555102,16315558723,16505212669,16507885280,19032707825,0" }
    readonly system_msg_numbers_fb_inc: { readonly code: 1036; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly system_msg_text_styling: { readonly code: 6246; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly system_provenance_allowed_fields: { readonly code: 41936; readonly type: "string"; readonly defaultValue: "{\"fields\": [\"iptc-digital-source-type\"]}"; readonly debugDefaultValue: "{\"fields\": [\"iptc-digital-source-type\"]}" }
    readonly system_provenance_allowed_values: { readonly code: 43258; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "{\"version\":1,\"make\":[],\"ai_system_used\":[{\"written_value\":\"Meta    AI\",\"input_match_values\":[]},{\"written_value\":\"Gemini\",\"input_match_values\":[\"Google    Gemini\"]}],\"publisher\":[{\"written_value\":\"Meta\",\"input_match_values\":[\"Meta Platforms,    Inc.\"]},{\"written_value\":\"Google\",\"input_match_values\":[\"Google LLC\",\"Google Media Processing    Services\"]}]}" }
    readonly system_provenance_destinations: { readonly code: 41649; readonly type: "string"; readonly defaultValue: "{\"destinations\": []}"; readonly debugDefaultValue: "{\"destinations\": []}" }
    readonly tappable_links_in_poll_option_enabled: { readonly code: 26062; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly tctoken_duration: { readonly code: 865; readonly type: "int"; readonly defaultValue: 604800; readonly debugDefaultValue: 604800 }
    readonly tctoken_duration_sender: { readonly code: 996; readonly type: "int"; readonly defaultValue: 604800; readonly debugDefaultValue: 604800 }
    readonly tctoken_num_buckets: { readonly code: 909; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly tctoken_num_buckets_sender: { readonly code: 997; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly teamlink_consumer_experience_enabled: { readonly code: 35138; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly teamlink_enabled: { readonly code: 33978; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly text_status_ttl_seconds_allowlist: { readonly code: 6153; readonly type: "string"; readonly defaultValue: "1800,3600,7200,14400,28800,86400"; readonly debugDefaultValue: "1800,3600,7200,14400,28800,86400" }
    readonly text_user_journey_logging_wam_enabled: { readonly code: 8627; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly third_party_media_provider_request_logging_enabled: { readonly code: 39819; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly thread_interactions_channel_own_posts_sent_web_enabled: { readonly code: 38275; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly thread_interactions_channel_reads_aligned_web_enabled: { readonly code: 38165; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly thread_interactions_falco_native_logging_enabled: { readonly code: 37737; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly thread_interactions_received_excludes_edits_web_enabled: { readonly code: 38058; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly timeout_mex_call_expand_fmx_trust_signals: { readonly code: 27862; readonly type: "int"; readonly defaultValue: 600; readonly debugDefaultValue: 600 }
    readonly top_level_message_secret_check: { readonly code: 23796; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly tos_3_client_gating_enabled: { readonly code: 791; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly tos_client_state_fetch_enabled: { readonly code: 877; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly tos_client_state_fetch_iteration: { readonly code: 908; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly transcode_and_repair_videos: { readonly code: 26027; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly ts_session_duration_ms: { readonly code: 3860; readonly type: "int"; readonly defaultValue: 600000; readonly debugDefaultValue: 600000 }
    readonly ts_surface_killswitch: { readonly code: 4929; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly ugc_enabled: { readonly code: 3011; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly ugc_participant_limit: { readonly code: 4118; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly unified_calling_entry_point_desktop_type: { readonly code: 21591; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly unified_otp_copy_code_url: { readonly code: 3827; readonly type: "string"; readonly defaultValue: "https://www.whatsapp.com/otp/copy/"; readonly debugDefaultValue: "https://www.whatsapp.com/otp/copy/" }
    readonly unified_otp_retriever_url: { readonly code: 3828; readonly type: "string"; readonly defaultValue: "https://www.whatsapp.com/otp/code"; readonly debugDefaultValue: "https://www.whatsapp.com/otp/code" }
    readonly unified_poll_vote_addon_infra_enabled: { readonly code: 6046; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unified_response_ai_content_search_enabled: { readonly code: 30000; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unified_response_ai_sports_widget_enabled: { readonly code: 31780; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unified_response_markdown_links_enabled: { readonly code: 30330; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unified_session_log_call_event: { readonly code: 8582; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unify_end_call_events: { readonly code: 2856; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unknown_user_persistence_logging_enabled: { readonly code: 34465; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly unknown_user_recovery_enabled: { readonly code: 35321; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unknown_user_target_rid_logging: { readonly code: 34232; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly unknown_user_usync_request_cool_down: { readonly code: 35318; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly unknown_user_wam_emit_cooldown_secs: { readonly code: 34551; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly unknown_user_wam_max_events_per_window: { readonly code: 32946; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly updates_privacy_notice_rollout_date: { readonly code: 14387; readonly type: "int"; readonly defaultValue: 1742310000; readonly debugDefaultValue: 1742310000 }
    readonly updates_quick_promotion_banner_enabled: { readonly code: 13997; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly updates_tab_channels_header_explore_entry_point_visibility: { readonly code: 33934; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly updates_tab_channels_section_header_visibility: { readonly code: 33935; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly updates_tab_channels_show_recommendation_unit_enabled: { readonly code: 33937; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly updates_tab_channels_show_unfollowed_search_results_enabled: { readonly code: 33936; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly upload_document_thumb_mms_enabled: { readonly code: 247; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly upr_payments_deep_link: { readonly code: 40245; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly use_cached_app_settings_from_global_ctx: { readonly code: 13428; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly use_custom_soccer_ball_for_reaction_enabled: { readonly code: 27807; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly use_signed_shimmed_url_link: { readonly code: 11977; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_1on1_sys_msg_creation_upsell_enabled: { readonly code: 27359; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly username_activation_qp: { readonly code: 32809; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_adoption_and_engagement_monitoring_enabled: { readonly code: 15493; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly username_antiscraping_send_cached_un: { readonly code: 31261; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly username_api_rate_limit_enabled: { readonly code: 28678; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_channels_pn_privacy_enabled: { readonly code: 23795; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_check_debounce_in_ms: { readonly code: 18975; readonly type: "int"; readonly defaultValue: 600; readonly debugDefaultValue: 600 }
    readonly username_contact_card_dedupe_icons: { readonly code: 32614; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_contact_display: { readonly code: 4746; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly username_contact_privacy_setting_allow_uncontact_set_enable: { readonly code: 20993; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_contact_syncd_support_enable: { readonly code: 17614; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_contact_ui_vcard: { readonly code: 18204; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_contact_usync_lid_based: { readonly code: 14565; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_contacts_ui_refresh: { readonly code: 25059; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_creation_reservation_pp_disclosure_enabled: { readonly code: 32098; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_enabled_on_companion: { readonly code: 23817; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_engagement_network_impact_logging: { readonly code: 11794; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly username_exposed_logging_enabled: { readonly code: 25353; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_global_search_enabled: { readonly code: 18251; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_group_mutation_enabled: { readonly code: 16148; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_key_alphanumeric_charset: { readonly code: 34791; readonly type: "string"; readonly defaultValue: "0123456789ABCDEFGHJKLMNPQRSTVWXYZ"; readonly debugDefaultValue: "0123456789ABCDEFGHJKLMNPQRSTVWXYZ" }
    readonly username_key_display_ui: { readonly code: 34343; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_key_entry_ui_v2: { readonly code: 34226; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_key_max_length: { readonly code: 34348; readonly type: "int"; readonly defaultValue: 6; readonly debugDefaultValue: 6 }
    readonly username_key_min_length: { readonly code: 34347; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly username_key_redesign_enabled: { readonly code: 29026; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_key_regex: { readonly code: 34350; readonly type: "string"; readonly defaultValue: "^([0-9]{4}|[A-Z0-9]{6})$"; readonly debugDefaultValue: "^([0-9]{4}|[A-Z0-9]{6})$" }
    readonly username_key_upsell_max_characters: { readonly code: 25790; readonly type: "int"; readonly defaultValue: 8; readonly debugDefaultValue: 8 }
    readonly username_key_upsell_max_numbers: { readonly code: 25789; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly username_key_upsell_mode: { readonly code: 26220; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly username_lid_migration_calling: { readonly code: 21890; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_max_length: { readonly code: 20459; readonly type: "int"; readonly defaultValue: 35; readonly debugDefaultValue: 35 }
    readonly username_mex_account_sync_enabled: { readonly code: 8763; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_min_length: { readonly code: 20494; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly username_numeric_code_v4: { readonly code: 14286; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly username_peer_learning_gate_killswitch: { readonly code: 40532; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly username_pn_contact_info_display: { readonly code: 40979; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_pn_sharing_common_group_count: { readonly code: 41879; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly username_pn_sharing_companion_enabled: { readonly code: 41430; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_pn_sharing_enabled: { readonly code: 41304; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_pn_sharing_fetch_cooldown_sec: { readonly code: 42065; readonly type: "int"; readonly defaultValue: 600; readonly debugDefaultValue: 600 }
    readonly username_pn_sharing_history_sync_enabled: { readonly code: 42509; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_pn_sharing_receiver_enabled: { readonly code: 41664; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_pn_sharing_sender_companion_enabled: { readonly code: 42497; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_pn_sharing_ui_settings_enabled: { readonly code: 41173; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_prevent_pn_populate_new_contact_creation: { readonly code: 16495; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_search: { readonly code: 15956; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_search_without_atsign_enabled: { readonly code: 32948; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_security_code_generation: { readonly code: 7468; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly username_suggestions_enabled: { readonly code: 21984; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly username_unknown_user_logging_enabled: { readonly code: 32978; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly utility_appointment_logging_enabled: { readonly code: 23709; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly utility_order_status_logging_enabled: { readonly code: 19059; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly utility_order_view_mbs_enabled: { readonly code: 31282; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly utility_payment_reminder_m1_enabled: { readonly code: 22434; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly utility_payment_reminder_m1_logging_enabled: { readonly code: 22785; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly utm_tracking_enabled: { readonly code: 2895; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly utm_tracking_expiration_hours: { readonly code: 2896; readonly type: "int"; readonly defaultValue: 24; readonly debugDefaultValue: 24 }
    readonly verified_badge_in_chats_list_enabled: { readonly code: 9292; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly vid_port_enable_capture_fps_median_filter: { readonly code: 29214; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly vid_port_frm_buf_mutex_fixes: { readonly code: 22525; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly vid_stream_pause_resume_jb_reset_threshold_ms: { readonly code: 2642; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly video_stream_buffering_ui_enabled: { readonly code: 2167; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly view_replies_entry_point: { readonly code: 19860; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly view_replies_infra_enabled: { readonly code: 14199; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly view_replies_is_composer_enabled: { readonly code: 20817; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly view_replies_with_threadid_enabled: { readonly code: 16998; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly visible_message_drop_placeholder_enabled_internal_only: { readonly code: 7287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly vod_itm_approach: { readonly code: 38384; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly vod_itm_max_short_edge: { readonly code: 38382; readonly type: "int"; readonly defaultValue: 576; readonly debugDefaultValue: 576 }
    readonly vod_itm_min_short_edge: { readonly code: 38381; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly vod_sharpen_filter_max_short_edge: { readonly code: 38263; readonly type: "int"; readonly defaultValue: 576; readonly debugDefaultValue: 576 }
    readonly vod_sharpen_filter_min_short_edge: { readonly code: 38269; readonly type: "int"; readonly defaultValue: 576; readonly debugDefaultValue: 576 }
    readonly vod_sharpen_filter_spec: { readonly code: 39993; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly vod_sharpen_filter_strength: { readonly code: 38265; readonly type: "float"; readonly defaultValue: 0.20000000298023224; readonly debugDefaultValue: 0.20000000298023224 }
    readonly vod_vsr_canvas_height: { readonly code: 39990; readonly type: "int"; readonly defaultValue: 576; readonly debugDefaultValue: 576 }
    readonly vod_vsr_canvas_width: { readonly code: 39991; readonly type: "int"; readonly defaultValue: 1024; readonly debugDefaultValue: 1024 }
    readonly vod_vsr_max_short_edge: { readonly code: 38039; readonly type: "int"; readonly defaultValue: 576; readonly debugDefaultValue: 576 }
    readonly vod_vsr_model_load_queue_priority: { readonly code: 41796; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly vod_vsr_num_setup_retries: { readonly code: 41700; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly vod_vsr_precision: { readonly code: 39992; readonly type: "int"; readonly defaultValue: 32; readonly debugDefaultValue: 32 }
    readonly vod_vsr_retry_interval_s: { readonly code: 41701; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly voice_ai_conversation_starter_latency_tracking: { readonly code: 19624; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly voice_call_string_test: { readonly code: 27841; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly voice_chat_companion_experience_version: { readonly code: 17052; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly voicemail_nudge_duration_ms: { readonly code: 18339; readonly type: "int"; readonly defaultValue: 4000; readonly debugDefaultValue: 4000 }
    readonly voip_aleg_v1_enabled: { readonly code: 36083; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly voip_call_coordinator_version: { readonly code: 9502; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly voip_enable_1to1_accepted_elsewhere_call_log_update: { readonly code: 40535; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly voip_enable_webrtc_stats_polling: { readonly code: 26744; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly voip_stack_incoming_message_ownership_transfer: { readonly code: 16481; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_asteria_eligibility_subscription_status_check_enabled: { readonly code: 26399; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_asteria_enabled: { readonly code: 26234; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_asteria_meta_ai_settings_tab_entrypoint_enabled: { readonly code: 27118; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_asteria_rollout_enabled: { readonly code: 26996; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_auth_agent_offboarding_enabled: { readonly code: 29923; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_biz_ai_1p_calendar_m1_enabled: { readonly code: 34231; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_biz_ai_appointment_connector_infra_enabled: { readonly code: 34202; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_biz_gap_enforcement_rules_sync_to_meta_enabled_ac_linked_user: { readonly code: 34290; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_biz_payment_template_click_signals: { readonly code: 33170; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_biz_url_cta_click_signals: { readonly code: 34726; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_catalog_graphql_use_lid_enabled: { readonly code: 30797; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_coex_biz_ai_capping_eligible: { readonly code: 34276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_consumer_nova_eligibility_subscription_status_check_enabled: { readonly code: 25388; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_consumer_nova_entry_point_settings_enabled: { readonly code: 24495; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_consumer_nova_settings_green_dot_enabled: { readonly code: 24955; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_consumer_nova_subscription_notifications_enabled: { readonly code: 27068; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_consumer_subscription_u18_gating_enabled: { readonly code: 38120; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_contact_manager_meta_one_rollout_enabled: { readonly code: 42884; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ctwa_log_user_journey_enabled: { readonly code: 1681; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_ctwa_web_enable_continuous_duration: { readonly code: 31426; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ctwa_web_entrypoint_home_header_dropdown_enabled: { readonly code: 3095; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ctwa_web_entrypoint_home_header_enabled: { readonly code: 3058; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ctwa_web_entrypoint_manage_ads_home_header_dropdown_enabled: { readonly code: 3376; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ctwa_web_fetch_linked_accounts_enabled: { readonly code: 3294; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ctwa_web_hide_ad_context_if_soft_dismissed_in_primary: { readonly code: 9729; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ctwa_web_thread_ad_attribution_enabled: { readonly code: 2898; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_force_fail_meta_one_smb_eligibility: { readonly code: 36521; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_hatch_companion_onboarding_url: { readonly code: 39912; readonly type: "string"; readonly defaultValue: "https://muse.ai/join"; readonly debugDefaultValue: "https://muse.ai/join" }
    readonly wa_hatch_mweb_onboarding_url: { readonly code: 38467; readonly type: "string"; readonly defaultValue: "https://muse.ai/?source=whatsapp_linking"; readonly debugDefaultValue: "https://muse.ai/?source=whatsapp_linking" }
    readonly wa_hybrid_collect_new_memory_metrics: { readonly code: 36574; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_hybrid_use_minimal_window: { readonly code: 35352; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_individual_new_chat_msg_capping_fetch_ttl_seconds: { readonly code: 20649; readonly type: "int"; readonly defaultValue: 3600; readonly debugDefaultValue: 3600 }
    readonly wa_individual_new_chat_msg_capping_limit: { readonly code: 17845; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_individual_new_chat_msg_capping_mv_get_subscription_v2: { readonly code: 20667; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_individual_new_chat_msg_fci_staleness_ttl_in_seconds: { readonly code: 21410; readonly type: "int"; readonly defaultValue: 120; readonly debugDefaultValue: 120 }
    readonly wa_individual_new_chat_msg_latest_rampup_date: { readonly code: 20601; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_individual_new_chat_thread_capping_limit: { readonly code: 29369; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_audio_experience_id: { readonly code: 37379; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_audio_experience_id: { readonly code: 37394; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_document_experience_id: { readonly code: 34915; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_other_experience_id: { readonly code: 34950; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_photo_experience_id: { readonly code: 34911; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_ptt_audio_experience_id: { readonly code: 34916; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_ptt_experience_id: { readonly code: 37395; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_reaction_experience_id: { readonly code: 37396; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_sticker_experience_id: { readonly code: 34913; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_text_experience_id: { readonly code: 34946; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_url_experience_id: { readonly code: 37393; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_channel_video_experience_id: { readonly code: 34912; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_audio_experience_id: { readonly code: 37386; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_document_experience_id: { readonly code: 34903; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_other_experience_id: { readonly code: 34948; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_photo_experience_id: { readonly code: 34899; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_ptt_audio_experience_id: { readonly code: 34904; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_ptt_experience_id: { readonly code: 37385; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_reaction_experience_id: { readonly code: 37388; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_sticker_experience_id: { readonly code: 34901; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_text_experience_id: { readonly code: 34944; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_url_experience_id: { readonly code: 37387; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_chat_video_experience_id: { readonly code: 34900; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_document_experience_id: { readonly code: 34897; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_experience_id_receive_enabled: { readonly code: 35167; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_media_image_upload_cache: { readonly code: 22784; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_media_other_experience_id: { readonly code: 34947; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_photo_experience_id: { readonly code: 34893; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_ptt_audio_experience_id: { readonly code: 34898; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_ptt_experience_id: { readonly code: 37376; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_reaction_experience_id: { readonly code: 37384; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_audio_experience_id: { readonly code: 37391; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_document_experience_id: { readonly code: 34909; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_other_experience_id: { readonly code: 34949; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_photo_experience_id: { readonly code: 34905; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_ptt_audio_experience_id: { readonly code: 34910; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_ptt_experience_id: { readonly code: 37392; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_reaction_experience_id: { readonly code: 37389; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_sticker_experience_id: { readonly code: 34907; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_text_experience_id: { readonly code: 34945; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_url_experience_id: { readonly code: 37390; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_status_video_experience_id: { readonly code: 34906; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_sticker_experience_id: { readonly code: 34895; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_text_experience_id: { readonly code: 34943; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_url_experience_id: { readonly code: 37383; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_media_video_experience_id: { readonly code: 34894; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_meta_one_eligibility_check_enabled: { readonly code: 31606; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_meta_one_eligibility_subscription_status_check_enabled: { readonly code: 28613; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_meta_one_enabled: { readonly code: 28611; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_meta_one_launch_free_trial_enabled: { readonly code: 29290; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_meta_one_rollout_enabled: { readonly code: 28612; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_meta_one_subscription_notifications_enabled: { readonly code: 29866; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_msg_tctoken_receive_enabled: { readonly code: 40575; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_web_add_media_dummy: { readonly code: 35872; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_web_add_media_rollout: { readonly code: 35871; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_web_advertise_badge_dummy_enabled: { readonly code: 37296; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_web_advertise_badge_enabled: { readonly code: 37295; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_web_advertise_subcontent_dummy_variant: { readonly code: 41608; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_native_ads_web_advertise_subcontent_variant: { readonly code: 41609; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_native_ads_web_creation_dummy: { readonly code: 33640; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_web_creation_rollout: { readonly code: 33639; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_web_creation_rollout_no_exposure: { readonly code: 33752; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_xplat_draft_ads_ms1a_dummy_enabled: { readonly code: 33374; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_native_ads_xplat_draft_ads_ms1a_enabled: { readonly code: 33372; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_navchain_context_resolution_enabled: { readonly code: 37182; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_nct_capping_kill_switch_enabled: { readonly code: 34795; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_nct_token_history_sync_enabled: { readonly code: 25189; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_nct_token_salt_creation_enabled: { readonly code: 24915; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_nct_token_send_enabled: { readonly code: 24941; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_nct_token_syncd_enabled: { readonly code: 25253; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_ohai_new_vip_header_enabled: { readonly code: 31340; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_payments_smb_enabled: { readonly code: 27173; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_payments_smb_labels_convention_enabled: { readonly code: 27172; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_qp_exposure_log_via_graphql_enabled: { readonly code: 31560; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_settings_read_receipts_copy_v2: { readonly code: 33610; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_smb_biz_profile_google_integration_enabled: { readonly code: 29007; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_smb_orders_deprecation_banners: { readonly code: 39445; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_status_chain_new_at_end: { readonly code: 24110; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_status_chain_unseen_min_pog: { readonly code: 24500; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly wa_sticker_store_insights_country_threshold: { readonly code: 38266; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly wa_subs_benefit_loss_enabled: { readonly code: 37617; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_subs_cancel_anytime_enabled: { readonly code: 37615; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_subs_mo_consumer_paywall_optimization_enabled: { readonly code: 38067; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_subs_sub_management_page_enabled: { readonly code: 39144; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_subs_try_for_zero_enabled: { readonly code: 37616; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_subs_wa_plus_hero_benefits_on_paywall_enabled: { readonly code: 38861; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_subs_wa_plus_paywall_optimization_enabled: { readonly code: 38066; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_subscription_resync_after_missing_active_seconds: { readonly code: 42241; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_subscriptions_unified_api_enabled: { readonly code: 42797; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_teamlink_invitation_privacy_gate_enabled: { readonly code: 39154; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_thumbnail_gen_in_worker_enabled: { readonly code: 37062; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_username_revocation_client_enabled: { readonly code: 30603; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_vpv_logging_phases_enabled: { readonly code: 35650; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_adaptive_layout_enabled: { readonly code: 30140; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_agm_signup_enabled: { readonly code: 26467; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_anr_pushname_check_enabled: { readonly code: 32065; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_anyone_can_link_m2: { readonly code: 24432; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_anyone_can_link_m2_flood_limit: { readonly code: 25009; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly wa_web_app_lock_upsell: { readonly code: 20064; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_background_notifications: { readonly code: 33844; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_base_video_comet_video_player_enabled: { readonly code: 25660; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_biz_broadcast_collection_based_campaigns_enabled: { readonly code: 31682; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_biz_broadcasts_catalog_attachment: { readonly code: 28471; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_biz_broadcasts_contextual_entrypoints: { readonly code: 30270; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_biz_profile_google_integration_enabled: { readonly code: 31246; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_biz_profile_graphql_migration: { readonly code: 25846; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_biz_profile_preload: { readonly code: 31842; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_bot_orphan_logic_enabled: { readonly code: 29753; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_bot_tos_check_refiniement: { readonly code: 28897; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_browser_notifications_popup_guide: { readonly code: 36012; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_buttons_response_prop_removal_killswitch: { readonly code: 33817; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_call_user_journey_logging_enabled: { readonly code: 35896; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_call_user_journey_logging_m2_enabled: { readonly code: 38252; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_calls_tab_empty_state_update_enabled: { readonly code: 33154; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_calls_tab_new_call_fab_enabled: { readonly code: 38458; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_calls_tab_notifications_off_banner_enabled: { readonly code: 37282; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_calls_tab_overflow_menu_enabled: { readonly code: 38616; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_chat_empty_state_update_enabled: { readonly code: 33153; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_chatlist_activation_banner_enabled: { readonly code: 34762; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_deep_link_error: { readonly code: 10051; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly wa_web_calling_frequently_contacted_enabled: { readonly code: 40279; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_incoming_call_tab_indicator_enabled: { readonly code: 38675; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_new_call_drawer_actions_enabled: { readonly code: 38611; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_notification_icons_enabled: { readonly code: 38669; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_notifications_mute_duration_enabled: { readonly code: 39980; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_post_call_notifications_upsell_enabled: { readonly code: 41605; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_calling_push_notification_on_call_end_enabled: { readonly code: 34763; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_settings_mode: { readonly code: 37116; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_calling_sidenav_calls_tab_nux_enabled: { readonly code: 33008; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_calling_whats_new_modal_update_enabled: { readonly code: 33155; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_canonical_wam_falco_buffer_enabled: { readonly code: 30212; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_canonical_wam_falco_buffer_size: { readonly code: 30219; readonly type: "int"; readonly defaultValue: 2000; readonly debugDefaultValue: 2000 }
    readonly wa_web_chaining_from_my_status: { readonly code: 33019; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_channels_comet_video_player_enabled_v2: { readonly code: 24541; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_chat_search_entrypoint: { readonly code: 25609; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_chat_themes: { readonly code: 26629; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_chat_themes_logging: { readonly code: 29457; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_chat_themes_solid_wallpaper_sync_encode: { readonly code: 32878; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_chat_themes_stock_wallpaper_sync_encode: { readonly code: 34349; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_chatlist_render_chat_open: { readonly code: 27947; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_clear_selected_chats_enabled: { readonly code: 20626; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_comet_video_player_snapl: { readonly code: 25065; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly wa_web_companion_discovery_upsell_enabled: { readonly code: 41953; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_companion_logout_reminder_days: { readonly code: 42390; readonly type: "string"; readonly defaultValue: "\"\""; readonly debugDefaultValue: "\"\"" }
    readonly wa_web_composer_height_increase_enabled: { readonly code: 27441; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_console_log_level: { readonly code: 16806; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 1 }
    readonly wa_web_contact_and_chat_fuzzy_search_async_enabled: { readonly code: 33433; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_contact_and_chat_fuzzy_search_distance_threshold: { readonly code: 26731; readonly type: "float"; readonly defaultValue: 0.30000001192092896; readonly debugDefaultValue: 0.30000001192092896 }
    readonly wa_web_contact_and_chat_fuzzy_search_timeout_threshold: { readonly code: 26733; readonly type: "float"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly wa_web_contact_search_tokenized_enabled: { readonly code: 24773; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_copy_link_url_enabled: { readonly code: 25820; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_debug_color_code_retry_messages: { readonly code: 16138; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_default_profile_pics: { readonly code: 25455; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_defense_mode_quarantine_extra_pn_check: { readonly code: 33541; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_disable_prefetch_loadables: { readonly code: 21917; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_download_mimetype_check_block_enabled: { readonly code: 26555; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_draft_ad_business_home_card_dummy: { readonly code: 40620; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_draft_ad_business_home_card_enabled: { readonly code: 40619; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_drag_and_drop_capabilities: { readonly code: 39517; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 3 }
    readonly wa_web_edit_before_forwarding_to_status: { readonly code: 27616; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_enable_follow_up_reply_icon: { readonly code: 24429; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_enable_granular_notifications: { readonly code: 21909; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_enable_mention_message: { readonly code: 27714; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_enable_status_hq_thumbnail: { readonly code: 25079; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_enable_syncd_key_persistence_only_after_server_ack: { readonly code: 27069; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_enable_test_notification: { readonly code: 37356; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_expansion_countries_bonsai_enabled: { readonly code: 29543; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_export_chat: { readonly code: 26201; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_falco_clear_local_storage_queue_enabled: { readonly code: 18835; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_falco_console_logger: { readonly code: 28054; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_favicons_update_m1: { readonly code: 14260; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_feature_parity_small_wins: { readonly code: 26481; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_floating_chat_chrome: { readonly code: 39853; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_floating_chrome: { readonly code: 39862; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_fmx_agm_enabled: { readonly code: 13597; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_forward_add_message_enabled: { readonly code: 38175; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_forward_to_small_groups: { readonly code: 27157; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_group_info_notification_row: { readonly code: 25292; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_groups_in_common_multi_contact: { readonly code: 25808; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_growth_empty_state_upsell_variant_m1: { readonly code: 15557; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly wa_web_hd_download_nux_enabled: { readonly code: 41080; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_highlight_me_mention: { readonly code: 25408; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_highlight_me_mention_groupsize_threshold: { readonly code: 25836; readonly type: "int"; readonly defaultValue: 130; readonly debugDefaultValue: 130 }
    readonly wa_web_history_sync_dynamic_throttling: { readonly code: 19110; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly wa_web_horizontal_link_previews: { readonly code: 24425; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_hq_image_thumbnail_in_chat_scans: { readonly code: 27512; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_hybrid_context_menu_reactions_enabled: { readonly code: 17650; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_hybrid_simple_chat_conversation_context_menu_enabled: { readonly code: 17479; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_imagine_ur_enabled: { readonly code: 25331; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_important_msg_notification: { readonly code: 27614; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_inline_message_edit: { readonly code: 33334; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_jm_to_ts_queues: { readonly code: 37844; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_jm_to_ts_rest: { readonly code: 37846; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_jm_to_ts_serviced: { readonly code: 37847; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_jump_to_cart: { readonly code: 27939; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_large_group_presence_enabled: { readonly code: 29279; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_lists_full_width_filters: { readonly code: 25805; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_lists_m1_enabled: { readonly code: 22090; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_lists_m2_enabled: { readonly code: 22086; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_loader_button_uix_improvement: { readonly code: 27768; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_match_primary_icons: { readonly code: 29293; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_me_tab: { readonly code: 24944; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_media_download_rmr_on_hash_mismatch_enabled: { readonly code: 38672; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_media_editor_quality_for_all_photos_enabled: { readonly code: 43484; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_media_fast_forward_same_key_type_enabled: { readonly code: 38464; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_media_loader_button_uix_improvement: { readonly code: 33245; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_media_thumbnail_key_match_enabled: { readonly code: 38463; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_media_upload_retry_retries_count: { readonly code: 27782; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_mention_search: { readonly code: 28455; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_meta_one_biz_ai_additional_entry_points_enabled: { readonly code: 40644; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_meta_one_biz_ai_entry_point_enabled: { readonly code: 37987; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_meta_one_biz_tools_entry_point_enabled: { readonly code: 37912; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_meta_one_dev: { readonly code: 37481; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_meta_one_mock_billing: { readonly code: 39076; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_meta_one_subscription_notifications_enabled: { readonly code: 38221; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_not_receiving_notifications_banner_enabled: { readonly code: 41056; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_notifications_modal: { readonly code: 32228; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_notifications_modal_timer: { readonly code: 36113; readonly type: "int"; readonly defaultValue: 180; readonly debugDefaultValue: 180 }
    readonly wa_web_notifications_modal_variants: { readonly code: 32277; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_pathfinder_unsampling_config: { readonly code: 32631; readonly type: "string"; readonly defaultValue: "{\"schema_version\":1,\"session_flag_rules\":[]}"; readonly debugDefaultValue: "{\"schema_version\":1,\"session_flag_rules\":[{\"rule_id\":\"about_2_creation\",\"trigger_screen_keys\":[\"settings-drawer\",\"self-profile\"]}]}" }
    readonly wa_web_pre_chat_device_id_test: { readonly code: 26553; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_preload_conversation_chat_open: { readonly code: 25937; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_ptt_loader_button_uix_improvement: { readonly code: 32418; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_push_name_in_global_search_non_contacts_enabled: { readonly code: 28506; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_quick_reaction_in_context_menu: { readonly code: 40581; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_quick_reactions: { readonly code: 28621; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_reactions_motion_v2_enabled: { readonly code: 26102; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_reduce_cascading_updates_chat_open: { readonly code: 25006; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_reduce_forced_layout_chat_open: { readonly code: 24526; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_reply_with_selected_text: { readonly code: 42129; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_reply_with_selected_text_version: { readonly code: 42261; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_rich_response_replying_enabled: { readonly code: 30493; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_screen_share_receiver_zoom_enabled: { readonly code: 40297; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_search_empty_state_m1: { readonly code: 25310; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_search_highlight_offset_normalization_enabled: { readonly code: 37690; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_self_profile_photo_fix_enabled: { readonly code: 24945; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_send_hd_photo: { readonly code: 36998; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_send_hd_video: { readonly code: 37000; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_send_hevc_video: { readonly code: 37002; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_send_motion_photo: { readonly code: 37004; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_share_content_uj: { readonly code: 22813; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_show_av1_video: { readonly code: 41129; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_show_hd_photo: { readonly code: 26610; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_show_hd_video: { readonly code: 36999; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_show_hevc_video: { readonly code: 37001; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_show_motion_photo: { readonly code: 37003; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_show_status_ring_for_no_unread: { readonly code: 22567; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_small_group_presence_enabled: { readonly code: 29280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_smb_aura_benefits_enabled: { readonly code: 40079; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_smb_chat_empty_state_v2_enabled: { readonly code: 35354; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_smb_meta_one_mobile_signup_enabled: { readonly code: 40976; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_smb_pin_sync_keep_pins_enabled: { readonly code: 40080; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_start_chat_context_enabled: { readonly code: 40332; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_start_chat_context_ui_enabled: { readonly code: 40331; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_status_chain_from_chatlist: { readonly code: 33399; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_chain_new_at_end: { readonly code: 33400; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_comet_video_player_enabled: { readonly code: 24791; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_composer_quick_replies_enabled: { readonly code: 41620; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_first_upload_fix_enabled: { readonly code: 25015; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_hover_prefetch: { readonly code: 42779; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_hover_prefetch_dwell_ms: { readonly code: 42816; readonly type: "int"; readonly defaultValue: 200; readonly debugDefaultValue: 200 }
    readonly wa_web_status_list_open_prefetch_depth: { readonly code: 43376; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_status_list_prefetch: { readonly code: 42287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_list_prefetch_depth: { readonly code: 42288; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly wa_web_status_playable_before_thumbnail: { readonly code: 42284; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_progressive_decrypt: { readonly code: 42292; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_resharer_flow_enabled: { readonly code: 28812; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_unread_dot_prefetch: { readonly code: 42780; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_video_recovery: { readonly code: 42965; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_status_viewer_refresh_level: { readonly code: 41601; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_status_viewer_side_poster_identifiers_enabled: { readonly code: 25151; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_subscriptions_entry_point_settings_enabled: { readonly code: 37911; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_ur_bloks_enabled: { readonly code: 25332; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_ur_imagine_video_enabled: { readonly code: 25329; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_velocity_animate_migration_enabled: { readonly code: 31784; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_video_comet_video_player_enabled: { readonly code: 24905; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voice_note_transcript_enabled: { readonly code: 42214; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voip_adaptive_grid_page_size: { readonly code: 28909; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voip_audio_device_list_dedupe: { readonly code: 37140; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voip_device_menu_animation_stagger_ms: { readonly code: 37085; readonly type: "int"; readonly defaultValue: 96; readonly debugDefaultValue: 96 }
    readonly wa_web_voip_mic_health_compact_affordance: { readonly code: 37121; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voip_mic_health_experience: { readonly code: 34761; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voip_mic_input_level: { readonly code: 34765; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voip_speaker_menu_split: { readonly code: 37084; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_voip_stack_log_level: { readonly code: 30261; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly wa_web_wae_qpl_enabled: { readonly code: 21742; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly wa_web_wam_falco_critical_event_ids: { readonly code: 32632; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wa_web_wam_falco_flush_interval_ms: { readonly code: 32393; readonly type: "int"; readonly defaultValue: 3000; readonly debugDefaultValue: 3000 }
    readonly wa_web_wam_falco_mode: { readonly code: 25306; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_web_wam_falco_shadow_event_ids: { readonly code: 25309; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wa_web_win_hybrid_plus_enabled: { readonly code: 33753; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_win_hybrid_plus_incoming_popout: { readonly code: 35379; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_web_wrap_associated_child_message_enabled: { readonly code: 35738; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_xb_bubble_enabled: { readonly code: 32818; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_webtp_edit_menu_copy_variant: { readonly code: 35270; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_webtp_edit_pdf_in_whatsapp_enabled: { readonly code: 26279; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_webtp_pdf_renderer_mode_no_exposure: { readonly code: 27941; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_webtp_pdf_sharer_consent_copy_v2: { readonly code: 30771; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_webtp_print_pdf_enabled: { readonly code: 36716; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_webtp_skip_sharer_confirmation_variant: { readonly code: 38578; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wa_webtp_thumbnail_renderer_timeout_ms: { readonly code: 27148; readonly type: "int"; readonly defaultValue: 3000; readonly debugDefaultValue: 3000 }
    readonly wa_webtp_use_async_pdf_send: { readonly code: 30214; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_webtp_use_pdf_annotations: { readonly code: 32144; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_webtp_use_pdf_editor: { readonly code: 23498; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_webtp_use_pdf_renderer: { readonly code: 20607; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_webtp_use_thumbnail_renderer: { readonly code: 20555; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_win_pdf_rendering_enabled: { readonly code: 29548; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wa_win_webtp_pdf_viewer_preload_enabled: { readonly code: 33347; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly wabai_consent_cooldown: { readonly code: 5746; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly wabai_consent_required: { readonly code: 5747; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wabai_message_feedback_enabled: { readonly code: 5215; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wabai_message_rendering_enabled: { readonly code: 4873; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wabai_thread_sync_fixes_enabled: { readonly code: 42348; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly wabba_receiver_enabled: { readonly code: 10970; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wabba_save_to_camera_roll_enabled: { readonly code: 13114; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wae_metadata_integrity_timeout_minutes: { readonly code: 4849; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly wag_voice_messages_sandbox_killswitch: { readonly code: 41356; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wam_disable_abkey_attribute: { readonly code: 12390; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wam_disable_expokey_attribute: { readonly code: 12391; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wamedia_large_vsr_model_download_versions: { readonly code: 36056; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wamedia_vsr_model_in_test_versions: { readonly code: 39802; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wamo_privacy_tos_linked_highlighted_notice_id: { readonly code: 14985; readonly type: "string"; readonly defaultValue: "20610204"; readonly debugDefaultValue: "20610204" }
    readonly wamo_privacy_tos_unlinked_highlighted_notice_id: { readonly code: 14987; readonly type: "string"; readonly defaultValue: "20610203"; readonly debugDefaultValue: "20610203" }
    readonly wamo_status_sensitive_vertical_disclaimer_enabled: { readonly code: 38128; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wamo_sub_admin_enabled_v2: { readonly code: 11020; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wamo_sub_consumer_enabled_v2: { readonly code: 11021; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wamo_sub_logging_enabled_v2: { readonly code: 11017; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wamo_sub_messages_supported: { readonly code: 11062; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wamo_sub_process_message_kill_switch: { readonly code: 12722; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly wavoip_enable_ml_namespace_v2: { readonly code: 26947; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wavoip_large_ml_disk_check_enabled: { readonly code: 37964; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wavoip_large_ml_min_free_disk_headroom_mb: { readonly code: 37965; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly wavoip_large_uvq_model_download_versions: { readonly code: 36054; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_large_vsr_model_download_versions_v2: { readonly code: 34857; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_legacy_ml_qpl_exp_tag: { readonly code: 30561; readonly type: "string"; readonly defaultValue: "none"; readonly debugDefaultValue: "none" }
    readonly wavoip_ml_bwe_cong_model_download_versions: { readonly code: 21732; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_cong_model_download_versions_v2: { readonly code: 27991; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_gc_hd_target_model_download_versions: { readonly code: 21822; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_gc_hd_target_model_download_versions_v2: { readonly code: 28021; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_gc_undershoot_model_download_versions: { readonly code: 21821; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_gc_undershoot_model_download_versions_v2: { readonly code: 28019; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_hd_target_model_download_versions: { readonly code: 21738; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_hd_target_model_download_versions_v2: { readonly code: 27990; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_plc_model_download_versions: { readonly code: 5228; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_plc_model_download_versions_v2: { readonly code: 27998; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_quickhd_model_download_versions: { readonly code: 27109; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_quickhd_model_download_versions_v2: { readonly code: 28012; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_rl_model_download_versions: { readonly code: 21733; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_rl_model_download_versions_v2: { readonly code: 27994; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_tr_model_download_versions: { readonly code: 21734; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_tr_model_download_versions_v2: { readonly code: 27996; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_undershoot_model_download_versions: { readonly code: 5231; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_bwe_undershoot_model_download_versions_v2: { readonly code: 27916; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_automos_model_download_versions: { readonly code: 21731; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_automos_model_download_versions_v2: { readonly code: 27997; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_mlow_companion_model_download_versions_v2: { readonly code: 31947; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_ns_model_download_versions: { readonly code: 21737; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_ns_model_download_versions_v2: { readonly code: 27992; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_vmos_model_download_versions: { readonly code: 21736; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_vmos_model_download_versions_v2: { readonly code: 27993; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_vsr_model_download_versions: { readonly code: 21735; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_media_vsr_model_download_versions_v2: { readonly code: 27995; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_nadl_model_download_versions: { readonly code: 24174; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_nadl_model_download_versions_v2: { readonly code: 28015; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_qpl_exp_tag: { readonly code: 30539; readonly type: "string"; readonly defaultValue: "none"; readonly debugDefaultValue: "none" }
    readonly wavoip_ml_temp_model_download_versions: { readonly code: 21815; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_temp_model_download_versions_v2: { readonly code: 28014; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_transport_download_versions: { readonly code: 24173; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_transport_download_versions_v2: { readonly code: 28020; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly wavoip_ml_uvq_download_versions_v2: { readonly code: 28013; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly waweb_chatinfo_refresh: { readonly code: 23018; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly waweb_comms_in_backend_worker: { readonly code: 38414; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly waweb_crossposting_attributions: { readonly code: 26138; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly waweb_deprecate_initial_sync_ordering: { readonly code: 37833; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly waweb_enable_legacy_image_zoom: { readonly code: 27239; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly waweb_status_close_friends_poster_side_enabled: { readonly code: 41493; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly waweb_status_close_friends_viewer_side_enabled: { readonly code: 26659; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wds_radius_and_casing: { readonly code: 3350; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wds_web_chip: { readonly code: 20970; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wds_web_composer_toolbar_v2: { readonly code: 26773; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wds_web_dialog: { readonly code: 28557; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wds_web_expressions_panel: { readonly code: 25144; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wds_web_profile_photo: { readonly code: 27954; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wds_web_rich_text_field: { readonly code: 27264; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wds_web_submenus: { readonly code: 25351; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wds_web_text_layout: { readonly code: 31789; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wds_web_toast: { readonly code: 23486; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly weave_upsell_wa_smb: { readonly code: 35290; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_abprop_block_catalog_creation_ecommerce_compliance_india: { readonly code: 894; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_abprop_business_profile_refresh_linked_account_enabled: { readonly code: 764; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_abprop_business_profile_refresh_linked_accounts_killswitch: { readonly code: 1351; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_abprop_collections_nux_banner: { readonly code: 741; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_abprop_core_wam_runtime: { readonly code: 1753; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_abprop_direct_connection_md: { readonly code: 869; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_abprop_drop_full_history_sync: { readonly code: 600; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_abprop_media_links_docs_search: { readonly code: 2063; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_abprop_screen_lock_enabled: { readonly code: 1680; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_add_contact: { readonly code: 26892; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly web_add_member_smart_suggestions_enabled: { readonly code: 39512; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_admin_hub: { readonly code: 43224; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_adv_logout_on_self_device_list_expired: { readonly code: 11011; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ai_group_open_support: { readonly code: 23530; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ai_sticker_emission_enabled: { readonly code: 36294; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_album_group_cancel_retry_enabled: { readonly code: 41087; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_album_star_as_one_message_enabled: { readonly code: 41329; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_anr_app_launch_skew_rtt_guard_enabled: { readonly code: 40496; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_async_contacts_restore_from_db_enabled: { readonly code: 27775; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_async_media_decryption_enabled: { readonly code: 23200; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_async_msg_send_handler: { readonly code: 27249; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_async_native_app_state_bridge_enabled: { readonly code: 29551; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_async_sqlite_bridge_operations: { readonly code: 29460; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_batch_and_queue_bulk_contacts_db_writes_enabled: { readonly code: 25413; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_batch_close_notification_bridge_operations: { readonly code: 40491; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_batch_profile_picture_bridge_operations: { readonly code: 29122; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_batch_profile_picture_updates_enabled: { readonly code: 40487; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_batch_voip_pn_jid_bridge_operations: { readonly code: 40490; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_cache_media_file_exists_enabled: { readonly code: 40488; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_disable_memory_logging: { readonly code: 31047; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_anr_file_size_threshold_to_use_worker_mb: { readonly code: 22930; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_anr_group_metadata_yield: { readonly code: 29294; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_hybrid_bridge_json_events_enabled: { readonly code: 40492; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_media_chunk_enc_delay_enabled: { readonly code: 22931; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_native_app_state_async_reads_enabled: { readonly code: 40486; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_noop_gc_enabled: { readonly code: 25915; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_optimized_initial_contacts_sync_enabled: { readonly code: 30227; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_prune_cmc: { readonly code: 29060; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_skip_unused_contacts_db_updates_enabled: { readonly code: 30043; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_spinner_gpu_animation: { readonly code: 29405; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_throttle_signal_snapshot_enabled: { readonly code: 28890; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_anr_voip_bridge_json_events_enabled: { readonly code: 40489; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_audience_import_segment_text: { readonly code: 38294; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_aura_ringtones_windows_cache_enabled: { readonly code: 40494; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_autodownload_stickers: { readonly code: 7422; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_background_sync_v2: { readonly code: 8782; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_batched_status_sending_enabled: { readonly code: 34366; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_batched_status_split_to_parts: { readonly code: 34539; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_bb_genai_composer_min_words: { readonly code: 32054; readonly type: "int"; readonly defaultValue: 4; readonly debugDefaultValue: 4 }
    readonly web_bbo_enable_appointment_message: { readonly code: 41467; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_biz_profile_options: { readonly code: 14881; readonly type: "int"; readonly defaultValue: 116; readonly debugDefaultValue: 116 }
    readonly web_biz_quality_telemetry_enabled: { readonly code: 27855; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_biz_quality_telemetry_message_clicks_enabled: { readonly code: 27854; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_biz_quality_telemetry_message_level_actions_enabled: { readonly code: 28590; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_biz_quality_telemetry_message_reads_enabled: { readonly code: 28574; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_biz_simple_signal_enabled: { readonly code: 28573; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_bot_profile_gql_migration_enabled: { readonly code: 28941; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_browser_min_storage_quota: { readonly code: 3135; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 5 }
    readonly web_browser_quota_threshold: { readonly code: 3134; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly web_bug_reporting_request_peer_log_enabled: { readonly code: 30485; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_business_broadcast_genai_custom_user_prompt_enabled: { readonly code: 32052; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_business_broadcast_genai_text: { readonly code: 32050; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_business_broadcast_genai_text_languages: { readonly code: 32117; readonly type: "string"; readonly defaultValue: "en,es"; readonly debugDefaultValue: "en,es" }
    readonly web_business_broadcast_genai_text_max_tries: { readonly code: 32053; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly web_business_broadcast_genai_text_model: { readonly code: 32051; readonly type: "string"; readonly defaultValue: "LLAMA"; readonly debugDefaultValue: "LLAMA" }
    readonly web_business_broadcast_genai_text_no_exp: { readonly code: 32055; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_business_tools_drawer_enabled: { readonly code: 6803; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_cache_open_failed_reload_flow_enabled: { readonly code: 22155; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_calendar_message_density_enabled: { readonly code: 25823; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_call_push_notification_require_interaction: { readonly code: 36911; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_calling_auto_popout_video: { readonly code: 28046; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_calling_in_call_chat_enabled: { readonly code: 42665; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_calling_incoming_accept_pulse_enabled: { readonly code: 35144; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_calling_join_button_pulse_enabled: { readonly code: 35143; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_calling_missed_call_banner: { readonly code: 39016; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_calling_offline_call_notifications: { readonly code: 39433; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_calling_offline_resume_ordering: { readonly code: 29564; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_calling_pause_bg_during_call_mode: { readonly code: 34144; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_calling_perf_optimizations_bitmask: { readonly code: 22186; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly web_calling_self_preview_enlarge: { readonly code: 34817; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_calling_smooth_call_link_lobby: { readonly code: 33131; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_calls_tab_empty_state_buttons: { readonly code: 17724; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_catalog_recovery_flow_enabled: { readonly code: 14294; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_catalog_viewing_variants_enabled: { readonly code: 15534; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_channel_status_likes_sending_enabled: { readonly code: 32428; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_channel_status_likes_sending_enabled_no_exposure: { readonly code: 35221; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_channel_video_dash_enabled: { readonly code: 38790; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_channel_video_server_transcode_upload: { readonly code: 19920; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_chat_cell_skip_content_visibility: { readonly code: 42988; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_chat_info_action_buttons_refresh: { readonly code: 14664; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_chat_list_bold_title_and_sender: { readonly code: 41285; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_chatlist_fts_listener_cleanup: { readonly code: 33181; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_chatpsa_forwarding: { readonly code: 23695; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_chats_content_visibility: { readonly code: 31259; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_coex_simple_signal_enabled: { readonly code: 30577; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_comms_socket_reconnect_enabled: { readonly code: 7854; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_communities_general_chat_v_2: { readonly code: 8580; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_community_setting_add_members_enabled: { readonly code: 39649; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_configurable_quick_actions_m1: { readonly code: 29874; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_configurable_quick_actions_m1_channels: { readonly code: 31781; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_configurable_quick_actions_m1_communities: { readonly code: 31782; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_contact_collection_locale_listener: { readonly code: 31103; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_contact_db_broadcast_rows_cleanup_enabled: { readonly code: 42646; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_contact_sort_letters_first: { readonly code: 28962; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly web_contacts_and_groups_enabled: { readonly code: 40041; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_contacts_and_groups_online_now_enabled: { readonly code: 40460; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_conversation_cleanup_temp_collection: { readonly code: 30829; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_crosspost_settings_sync: { readonly code: 26296; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_date_marker_calendar_enabled: { readonly code: 25811; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_db_upgrade_from_stored_version: { readonly code: 42759; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_deprecate_mms4_hash_based_download: { readonly code: 3152; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_design_refresh: { readonly code: 6665; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_detached_dom_unmount_cleanup: { readonly code: 33393; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_dexie_hooks_support_enabled: { readonly code: 12831; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_disable_compose_box_for_deprecated_chats: { readonly code: 30753; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_disable_logs_low_end_device: { readonly code: 18660; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_disable_sw_on_safari_pwa: { readonly code: 7281; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_display_lid_contacts: { readonly code: 24280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_drawer_descriptor_enabled: { readonly code: 27677; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_e2e_backfill_expire_time: { readonly code: 3234; readonly type: "int"; readonly defaultValue: 5; readonly debugDefaultValue: 60 }
    readonly web_e2e_status_likes_sending_enabled: { readonly code: 34296; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_edit_group_permissions_inline_in_modal: { readonly code: 40769; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_email_invites_group_info: { readonly code: 33556; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_email_invites_server_send_enabled: { readonly code: 37284; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_emoji_17: { readonly code: 43328; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_employee_commands_prod_enabled: { readonly code: 42155; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_employee_commands_zero_click_enabled: { readonly code: 41095; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_employee_slash_commands_enabled: { readonly code: 40656; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_employee_thanks_prod_enabled: { readonly code: 42631; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_employee_thanks_recipient_lookup_enabled: { readonly code: 41405; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_empty_group_creation_enabled: { readonly code: 41772; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_enable_biz_catalog_view_ps_logging: { readonly code: 2056; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_enable_improved_bulk_merge: { readonly code: 19854; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_enable_profile_pic_thumb_db_caching: { readonly code: 2018; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_encryption_page_visit_logging: { readonly code: 41248; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_evict_thumbnail_hq_on_inactive: { readonly code: 32702; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_evolve_about_send_enabled: { readonly code: 5347; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_filtered_contacts_coalesce_recompute: { readonly code: 42190; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_fix_duplicated_lids_history_sync: { readonly code: 19994; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_force_lid_chats_in_history: { readonly code: 24343; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_frequently_contacted_enabled: { readonly code: 29063; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly web_get_msg_exist_optmise: { readonly code: 29880; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_getters_clear_caches_on_memory_over_mb: { readonly code: 38036; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 500 }
    readonly web_getters_clear_caches_on_memory_pressure: { readonly code: 38034; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_getters_lazy_slot_allocation: { readonly code: 35688; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_getters_lru_cache_size_limit: { readonly code: 30796; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_gif_search_compact_preview_enabled: { readonly code: 42003; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_gif_search_preview_commit_enabled: { readonly code: 42002; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_giphy_sticker_search_enabled: { readonly code: 41098; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_bulk_add_contact: { readonly code: 30417; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_experimentation_enable: { readonly code: 25414; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_hover_card_variant: { readonly code: 30260; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_group_info_v2: { readonly code: 40613; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_members_view_enabled: { readonly code: 42264; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_profile_editor: { readonly code: 1745; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_group_status_attribution_contact_info_enabled: { readonly code: 43201; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_status_floating_like_heads_dismiss_enabled: { readonly code: 43204; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_status_floating_like_heads_enabled: { readonly code: 43203; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_status_own_unread_ring_enabled: { readonly code: 43200; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_status_posting_enabled: { readonly code: 42424; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_group_status_reply_privately_enabled: { readonly code: 43202; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_guest_calling_representation_enabled: { readonly code: 31533; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_guest_calling_waiting_room_admin_xp_enabled: { readonly code: 33384; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_guest_calling_waiting_room_approval_note_enabled: { readonly code: 33385; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_history_sync_allow_duplicate_in_bulk_error: { readonly code: 10842; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_history_sync_worker_enabled: { readonly code: 24147; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_hybrid_apply_latest_db_schema_optimization_enabled: { readonly code: 23595; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_image_max_edge: { readonly code: 3042; readonly type: "int"; readonly defaultValue: 1600; readonly debugDefaultValue: 1600 }
    readonly web_image_max_hd_edge: { readonly code: 3204; readonly type: "int"; readonly defaultValue: 2560; readonly debugDefaultValue: 2560 }
    readonly web_improve_subtle_new_group_icon_in_forward: { readonly code: 39834; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_inbox_mentions_replies_filter: { readonly code: 40054; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_init_chat_batch_size: { readonly code: 1171; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly web_init_chat_max_unread_message_count: { readonly code: 1172; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_intern_dogfooding_upsell_content: { readonly code: 6860; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "" }
    readonly web_intern_dogfooding_upsell_enabled: { readonly code: 6858; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_intern_dogfooding_upsell_snooze_duration: { readonly code: 6859; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly web_internal_in_app_bug_reporting_enable: { readonly code: 4681; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_invite_options_in_add_members_variant: { readonly code: 41400; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_invite_options_in_add_membes_enabled: { readonly code: 39905; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ip_token_enabled: { readonly code: 20043; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_jpeg_quality: { readonly code: 6619; readonly type: "int"; readonly defaultValue: 92; readonly debugDefaultValue: 92 }
    readonly web_landing_page_group_button: { readonly code: 41067; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_larger_link_previews: { readonly code: 8172; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_link_preview_debounce_period_ms: { readonly code: 33339; readonly type: "int"; readonly defaultValue: 700; readonly debugDefaultValue: 700 }
    readonly web_link_preview_sync_enabled: { readonly code: 2156; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_log_capacity_override: { readonly code: 24363; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_loom_stuck_trace_timeout_ms: { readonly code: 34304; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 120000 }
    readonly web_low_end_device_level: { readonly code: 18747; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_mac_beta_upsell: { readonly code: 16223; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_material_refresh: { readonly code: 6332; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_max_contacts_to_show_common_groups: { readonly code: 2264; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly web_max_found_common_groups_displayed: { readonly code: 2268; readonly type: "int"; readonly defaultValue: 15; readonly debugDefaultValue: 15 }
    readonly web_media_compute_in_worker_enabled: { readonly code: 25641; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_media_encrypt_upload_in_worker_enabled: { readonly code: 31721; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_media_fast_forward_match_key_type_entry_enabled: { readonly code: 39440; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_memlab_fixes: { readonly code: 33563; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_memlab_fixes_2: { readonly code: 34305; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_memlab_fixes_3: { readonly code: 35488; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_memlab_fixes_4: { readonly code: 39307; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_memlab_fixes_backup: { readonly code: 36105; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_memories_subdomain_enabled: { readonly code: 34935; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_message_custom_aria_label: { readonly code: 2280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_message_drop_bulk_db_operation_fallback_enabled: { readonly code: 7865; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_message_list_a11y_redesign: { readonly code: 2016; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_message_list_skip_noop_scroll_anchor: { readonly code: 37294; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_message_plugin_frontend_registration_enabled: { readonly code: 2793; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_message_processing_cache_size: { readonly code: 3728; readonly type: "int"; readonly defaultValue: 400; readonly debugDefaultValue: 400 }
    readonly web_messages_content_visibility: { readonly code: 31260; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_mex_contact_discovery_bulk_import_enabled: { readonly code: 40908; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_mex_contact_discovery_enabled: { readonly code: 40909; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_mex_contacts_delta_sync_enabled: { readonly code: 40910; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_move_message_secret_top_level_enabled: { readonly code: 29492; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_multi_skin_toned_emoji_picker: { readonly code: 1850; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_native_fetch_media_download: { readonly code: 3031; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_new_event_emitter: { readonly code: 31127; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_new_group_smart_suggestions_enabled: { readonly code: 40064; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_new_group_ux_improvement_enabled: { readonly code: 41560; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_new_wds_icons: { readonly code: 31128; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_non_blocking_offline_resume_max_message_count: { readonly code: 2508; readonly type: "int"; readonly defaultValue: 1000; readonly debugDefaultValue: 1000 }
    readonly web_noncritical_history_sync_message_processing_break_iteration: { readonly code: 5106; readonly type: "int"; readonly defaultValue: 100; readonly debugDefaultValue: 100 }
    readonly web_notifications_banner_new_logic_enabled: { readonly code: 19399; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_notifications_banner_variant: { readonly code: 19168; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_offline_dynamic_batch_config: { readonly code: 5297; readonly type: "string"; readonly defaultValue: "{\"version\": \"progressive\", \"multiplier\": 0.25}"; readonly debugDefaultValue: "{\"version\": \"progressive\", \"multiplier\": 0.25}" }
    readonly web_offline_dynamic_batch_size_enabled: { readonly code: 5271; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_offline_message_processor_timeout_seconds: { readonly code: 8406; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_offline_resume_primary_snapshot_enabled: { readonly code: 43273; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_offline_resume_qpl_enabled: { readonly code: 1773; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_offline_resume_wait_for_ping_timeout_seconds: { readonly code: 16956; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly web_optimized_avatars: { readonly code: 31257; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_optimized_compositing_layers: { readonly code: 32280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_optimized_event_handlers: { readonly code: 31129; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_optimized_message_tails: { readonly code: 31258; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_optimized_pills: { readonly code: 31130; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_org_admin_ui_enabled: { readonly code: 35107; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_original_photo_quality_upload_enabled: { readonly code: 3136; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_pathfinder_logging: { readonly code: 27628; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 3 }
    readonly web_payment_notifications_ack_kick_fix_enabled: { readonly code: 7546; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_pdf_thumbnail_size_in_bytes: { readonly code: 16834; readonly type: "int"; readonly defaultValue: 1300; readonly debugDefaultValue: 1300 }
    readonly web_pending_message_cache_enabled: { readonly code: 8353; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_phone_number_global_search: { readonly code: 22603; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_photo_capture_browser_permission_button: { readonly code: 41955; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_pnless_stanzas: { readonly code: 26211; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_preload_chat_messages: { readonly code: 5079; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_premium_messages_interactivity_rendering_enabled: { readonly code: 4596; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_product_list_identity_mode: { readonly code: 42731; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 2 }
    readonly web_promote_group_actions_to_admins: { readonly code: 40469; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ptt_browser_permission_button: { readonly code: 41954; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ptt_render_throttling: { readonly code: 31126; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_ptt_streamer_upload: { readonly code: 1902; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ptt_transcription_button_enabled: { readonly code: 32799; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ptt_transcription_enabled: { readonly code: 32798; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_ptt_transcription_max_duration_seconds: { readonly code: 32800; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_pwa_background_sync: { readonly code: 6656; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_pwa_background_sync_min_interval_hours: { readonly code: 6706; readonly type: "int"; readonly defaultValue: 24; readonly debugDefaultValue: 24 }
    readonly web_qp_bb_re_engagement_past_29_days: { readonly code: 30570; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_qp_smb_bb_pmf_test_high_engagement_user: { readonly code: 30569; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_qp_smb_bb_recent_message_send: { readonly code: 30568; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_rating_and_review_contextual_prompt_enabled: { readonly code: 18737; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_read_self_watermark_receive_store_ts: { readonly code: 29396; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_read_self_watermark_send_store_ts: { readonly code: 29546; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_recent_sync_chunk_download_optimization: { readonly code: 7356; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_remove_message_secret_from_quoted_enabled: { readonly code: 29491; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_request_missing_keys_for_removes: { readonly code: 24838; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_resume_optimized_read_receipt_send_interval: { readonly code: 5502; readonly type: "int"; readonly defaultValue: 500; readonly debugDefaultValue: 500 }
    readonly web_resync_unreadable_participant_rows: { readonly code: 39514; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_retry_receipt_logging_enabled: { readonly code: 39657; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_screen_lock_max_retries: { readonly code: 2622; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 10 }
    readonly web_search_results_type_date_filters: { readonly code: 32787; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_self_adv_daily_use_lid: { readonly code: 34414; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_send_hid_failed_decrypt_in_receipts_enabled: { readonly code: 31113; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_send_orphan_in_receipts_enabled: { readonly code: 31114; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_sender_key_rotation_fix_enabled: { readonly code: 40006; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_shop_storefront_message: { readonly code: 1053; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_show_to_hide_enabled: { readonly code: 27958; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_signal_future_messages_max: { readonly code: 12509; readonly type: "int"; readonly defaultValue: 20000; readonly debugDefaultValue: 20000 }
    readonly web_socket_handshake_timeout_enabled: { readonly code: 42615; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_socket_handshake_timeout_seconds: { readonly code: 42640; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly web_socket_parallel_connection_enabled: { readonly code: 8019; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_bad_ux_logging_parity_enabled: { readonly code: 41116; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_batch_size: { readonly code: 34540; readonly type: "int"; readonly defaultValue: 500; readonly debugDefaultValue: 500 }
    readonly web_status_crossposting_enabled: { readonly code: 21501; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_drag_and_drop_enabled: { readonly code: 40953; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_likes_poster_counter_enabled: { readonly code: 36801; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_status_likes_send_v2_enabled: { readonly code: 26470; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_status_load_timer_pause_on_bg_enabled: { readonly code: 40689; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_ranking: { readonly code: 31683; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_ranking_enabled: { readonly code: 31684; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_recv_via_smax: { readonly code: 34258; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_status_send_via_smax: { readonly code: 34259; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_sender_key_rotation_enabled: { readonly code: 40007; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_skip_failed_primary_skdm_enabled: { readonly code: 40647; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_vpv_per_view_load_time_enabled: { readonly code: 39100; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_vpv_rebuffering_load_time_enabled: { readonly code: 39099; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_vpv_result_at_exit_enabled: { readonly code: 39101; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_status_vpv_successful_view_consistency_enabled: { readonly code: 39098; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_sticker_suggestions_enable: { readonly code: 4726; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_sticky_hd_photo_setting_enabled: { readonly code: 8115; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_store_quota_manager_enabled: { readonly code: 3133; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_streaming_document_encrypt_min_bytes: { readonly code: 31864; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 50000000 }
    readonly web_sw_notification_click_logging_enabled: { readonly code: 41510; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_sw_notification_click_raise_open_tab: { readonly code: 41509; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_syncd_batched_orphan_apply: { readonly code: 41877; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_syncd_fatal_fields_from_L1104589PRV2: { readonly code: 1808; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_syncd_individual_mutation_index_lookup: { readonly code: 40988; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_syncd_max_mutations_to_process_during_resume: { readonly code: 1513; readonly type: "int"; readonly defaultValue: 1000; readonly debugDefaultValue: 1000 }
    readonly web_tc_token_db_read_enabled: { readonly code: 5110; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_threads_infra_enabled: { readonly code: 21062; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_top_level_message_secret_enforcement_enabled: { readonly code: 32231; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_ui_refresh_m1: { readonly code: 12993; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_uplevel_pending_join_requests: { readonly code: 40472; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_use_kaleidoscope_media_check_enabled: { readonly code: 20375; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_usync_privacy_hints: { readonly code: 40287; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_validate_media_url_allowlist_enabled: { readonly code: 34890; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_vc_css_bg_scan_children_first: { readonly code: 41387; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_adaptive_sctp_prewarm: { readonly code: 32804; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_adaptive_sctp_prewarm_v2: { readonly code: 37167; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_audio_capture_impl: { readonly code: 21688; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_audio_pipeline_v2: { readonly code: 40623; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_audio_playback_impl: { readonly code: 21689; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_audio_playback_use_media_element_output: { readonly code: 35949; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_audio_shared_call_context: { readonly code: 42667; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_av_sync_debug_overlay: { readonly code: 31481; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_av_sync_strict_fifo_drain: { readonly code: 37275; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_background_blur: { readonly code: 42751; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_browser_mute_toast_enabled: { readonly code: 37450; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly web_voip_browser_permission_button_enabled: { readonly code: 39494; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_call_end_teardown_yield: { readonly code: 36805; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_call_push_notification_clear_timeout_sec: { readonly code: 36913; readonly type: "int"; readonly defaultValue: 60; readonly debugDefaultValue: 60 }
    readonly web_voip_camera_and_microphone_permission_button: { readonly code: 42726; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_camera_fingerprint_logging_enabled: { readonly code: 39096; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_deferred_boot_early_module_prefetch: { readonly code: 35091; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_deferred_boot_hidden_prewarm: { readonly code: 39722; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_deferred_boot_init: { readonly code: 34923; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_deferred_boot_init_max_delay_ms: { readonly code: 34924; readonly type: "int"; readonly defaultValue: 120000; readonly debugDefaultValue: 120000 }
    readonly web_voip_deferred_boot_recent_caller_eager_days: { readonly code: 41300; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_device_access_recovery_enabled: { readonly code: 38393; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_dtls_cert_cache_mode: { readonly code: 37058; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_dynamic_thread_preallocate_count: { readonly code: 23789; readonly type: "int"; readonly defaultValue: 6; readonly debugDefaultValue: 6 }
    readonly web_voip_icce_bubble_voice_and_video_enabled: { readonly code: 39981; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_incoming_offer_init_freshness_ms: { readonly code: 34925; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_incoming_stanza_from_heap: { readonly code: 41822; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_init_reliability_level: { readonly code: 41354; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_live_caption_probe_enabled: { readonly code: 36276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_load_wasm_variant: { readonly code: 23045; readonly type: "string"; readonly defaultValue: "prod-nonlab"; readonly debugDefaultValue: "prod-nonlab" }
    readonly web_voip_low_core_ipv6_relay_delay_ms: { readonly code: 36804; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_low_resource_device: { readonly code: 28203; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_main_thread_lock_fixes: { readonly code: 41190; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_missing_device_audio_fallback_mode: { readonly code: 41191; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_ml_disable_threadpool: { readonly code: 39699; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_outgoing_call_setup_latency_mode: { readonly code: 33122; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_pin_worker_glue_to_wasm: { readonly code: 36184; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_playback_restart_after_mic_mode: { readonly code: 37782; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_pre_init_worker_bootstrap: { readonly code: 34685; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_pthread_hardening_level: { readonly code: 37490; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_relay_setup_yield_ipv4_first: { readonly code: 36803; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_ringing_lobby_preview_gate_enabled: { readonly code: 38009; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_runtime_stack_selection_enabled: { readonly code: 33151; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_sctp_worker_safari_exp: { readonly code: 27695; readonly type: "int"; readonly defaultValue: 1; readonly debugDefaultValue: 1 }
    readonly web_voip_set_self_country_code_enabled: { readonly code: 40493; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_skip_offline_wait_on_call_intent: { readonly code: 33310; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_skip_post_handoff_fieldstats_cleanup: { readonly code: 40987; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_tcp_connection_fallback: { readonly code: 39858; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_tcp_connection_fallback_before_accept: { readonly code: 39899; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_use_content_addressed_wasm: { readonly code: 33389; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_video_capture_impl: { readonly code: 21350; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_video_drop_out_of_order_frames: { readonly code: 37276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_video_effects: { readonly code: 43065; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly web_voip_video_effects_entry_points: { readonly code: 43066; readonly type: "string"; readonly defaultValue: ""; readonly debugDefaultValue: "menu_and_self_view" }
    readonly web_voip_video_low_cap_height: { readonly code: 28042; readonly type: "int"; readonly defaultValue: 270; readonly debugDefaultValue: 270 }
    readonly web_voip_video_low_cap_width: { readonly code: 28041; readonly type: "int"; readonly defaultValue: 480; readonly debugDefaultValue: 480 }
    readonly web_voip_video_mid_cap_height: { readonly code: 28044; readonly type: "int"; readonly defaultValue: 360; readonly debugDefaultValue: 360 }
    readonly web_voip_video_mid_cap_width: { readonly code: 28043; readonly type: "int"; readonly defaultValue: 640; readonly debugDefaultValue: 640 }
    readonly web_voip_video_presentation_orientation_fix: { readonly code: 35716; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_voip_video_renderer: { readonly code: 20573; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly web_voip_webtransport_timeout_before_sctp_fallback_ms: { readonly code: 35334; readonly type: "int"; readonly defaultValue: 4000; readonly debugDefaultValue: 4000 }
    readonly web_waffle: { readonly code: 14300; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_whats_new_auto_modal: { readonly code: 29621; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_whats_new_auto_modal_content_version: { readonly code: 33475; readonly type: "int"; readonly defaultValue: 2; readonly debugDefaultValue: 2 }
    readonly web_whats_new_auto_modal_short_cooldown: { readonly code: 29622; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_whats_new_banner: { readonly code: 29619; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_whats_new_banner_short_cooldown_v2: { readonly code: 29709; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_whats_new_carousel: { readonly code: 29618; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_windows_calling_32p_version: { readonly code: 31845; readonly type: "int"; readonly defaultValue: 3; readonly debugDefaultValue: 3 }
    readonly web_worker_adv_processing_enabled: { readonly code: 24924; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_worker_prekey_processing_enabled: { readonly code: 26133; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly webc_page_load_early_commit_enabled: { readonly code: 8458; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly webview2_disable_gpu_acceleration: { readonly code: 18262; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly webview2_disable_gpu_acceleration_memory_threshold_mb: { readonly code: 23073; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly webview2_enable_offline_support: { readonly code: 21793; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly whats_happening_emoji_only_creation_enabled: { readonly code: 41139; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly whatsapp_orgs_enabled: { readonly code: 33809; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly whatsapp_orgs_fetch_cooldown_secs: { readonly code: 34868; readonly type: "int"; readonly defaultValue: 86400; readonly debugDefaultValue: 86400 }
    readonly whatsapp_vpv_logging_enabled: { readonly code: 9833; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly win_call_log_send_outgoing_syncd_mutations: { readonly code: 5308; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_enable_ss_button_audio: { readonly code: 9633; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_add_call_participants_async_lookup_enabled: { readonly code: 41938; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_background_message_sync: { readonly code: 37827; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_background_run_records_enabled: { readonly code: 40473; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly win_hybrid_bg_task_class_mta_registration_enabled: { readonly code: 43226; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_bridge_ui_thread_completion_enabled: { readonly code: 39187; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_bridge_work_off_ui_thread_enabled: { readonly code: 40495; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_bt_enabled: { readonly code: 30041; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_contact_activities_enabled: { readonly code: 42680; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_contacts_invalid_chunked_commit_enabled: { readonly code: 41970; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_contacts_invalidate_off_ui_enabled: { readonly code: 41969; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_crash_snapshot_off_caller_enabled: { readonly code: 41973; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_eager_device_watching: { readonly code: 37128; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_efficiency_mode_opt_out_enabled: { readonly code: 42448; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_expiry_server_time_killswitch: { readonly code: 39501; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly win_hybrid_expiry_wrong_clock_block_enabled: { readonly code: 39502; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_extension_folder_prep_off_ui_enabled: { readonly code: 41941; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_extension_skip_reinstall: { readonly code: 38870; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_force_persistent_storage_permission: { readonly code: 20260; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly win_hybrid_log_upload_async_io_enabled: { readonly code: 41974; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_log_writer_thread_enabled: { readonly code: 42018; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_media_file_prep_off_ui_enabled: { readonly code: 41940; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_memory_reporter_toolhelp_enabled: { readonly code: 41975; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_multi_account_enabled: { readonly code: 40655; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_native_bridge_telemetry_enabled: { readonly code: 41412; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_native_bridge_tracing_enabled: { readonly code: 41411; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_native_to_web_events_via_ui_enabled: { readonly code: 41972; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_post_update_preload: { readonly code: 41562; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_profile_pictures_chunked_commit_enabled: { readonly code: 41971; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_push_task_all_banners_enabled: { readonly code: 40423; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_renderer_failure_max_reloads: { readonly code: 40531; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 3 }
    readonly win_hybrid_startup_telemetry_level: { readonly code: 40650; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 2 }
    readonly win_hybrid_tray_wake_keep_resumed_seconds: { readonly code: 38862; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 600 }
    readonly win_hybrid_voip_anr_optimizations: { readonly code: 22616; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly win_hybrid_voip_perf_sampling_off_ui_enabled: { readonly code: 41939; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_vsr_button_enabled: { readonly code: 34272; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_vsr_button_enabled_2: { readonly code: 34279; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_vsr_device_setting_enabled_2: { readonly code: 35194; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_vsr_enabled: { readonly code: 34271; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_vsr_enabled_2: { readonly code: 34280; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly win_hybrid_watchdog_normal_priority_ping_relay_enabled: { readonly code: 42259; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_hybrid_webview_lifecycle_skip_redundant_calls_enabled: { readonly code: 41968; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly win_network_state_watchdog_interval: { readonly code: 7737; readonly type: "int"; readonly defaultValue: 30; readonly debugDefaultValue: 30 }
    readonly windows_contacts_initial_sync_delay: { readonly code: 24883; readonly type: "int"; readonly defaultValue: 10; readonly debugDefaultValue: 1 }
    readonly windows_contacts_sync_interval: { readonly code: 24882; readonly type: "int"; readonly defaultValue: 60; readonly debugDefaultValue: 5 }
    readonly windows_graceful_degradation_version: { readonly code: 8454; readonly type: "int"; readonly defaultValue: 0; readonly debugDefaultValue: 0 }
    readonly winrt_renderer: { readonly code: 10966; readonly type: "bool"; readonly defaultValue: true; readonly debugDefaultValue: true }
    readonly wmi_async_await_prep: { readonly code: 29197; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_async_await_prep_decrypt: { readonly code: 35094; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_jm_to_ts_m1: { readonly code: 32880; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_jm_to_ts_queues: { readonly code: 35797; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_jm_to_ts_rest: { readonly code: 35798; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_jm_to_ts_serviced: { readonly code: 34410; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_task_scheduler_second_step: { readonly code: 30276; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_wa_web_message_delivery_qpl_instrumentation: { readonly code: 38244; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_wa_web_one_queue_adoption: { readonly code: 38245; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_wa_web_persisted_queue: { readonly code: 38247; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly wmi_worker_scheduler_web: { readonly code: 27237; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly work_send_enabled: { readonly code: 39872; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly www_native_ads_xplatform_drafts_dummy_enabled: { readonly code: 40602; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly www_native_ads_xplatform_drafts_enabled: { readonly code: 40603; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly xb_payments_send_again_fetch_enabled: { readonly code: 35074; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly xb_payments_send_money_v2_enabled: { readonly code: 35073; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly xplat_attachment_format_check_v2: { readonly code: 8082; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly youtube_inline_playback_killswitch: { readonly code: 3522; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
}

export declare const WA_GROUP_ABPROPS: {
    readonly ai_group_tee_history_share_group_level_enabled: { readonly code: 32501; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_send_admin_set_default_on_group_level: { readonly code: 36505; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly group_history_send_after_join_group_level: { readonly code: 30905; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_send_group_level: { readonly code: 23245; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_setting_decouple_enabled_group_level: { readonly code: 30906; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_history_settings_toggle_ui_group_level: { readonly code: 23246; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly group_settings_ia_group_level: { readonly code: 35639; readonly type: "int"; readonly defaultValue: -1; readonly debugDefaultValue: -1 }
    readonly pinned_messages_infinite_sender_group_level_enabled: { readonly code: 38083; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly pinned_messages_remove_30_day_pins_group_level: { readonly code: 38082; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_add_option_creator_enabled_group_level: { readonly code: 35772; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_add_option_enabled_group_level: { readonly code: 28357; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_creator_edit_enabled_group_level: { readonly code: 28358; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_end_time_enabled_group_level: { readonly code: 27009; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly poll_hide_voters_enabled_group_level: { readonly code: 27025; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly rt_ghs_sender_group_level_enabled: { readonly code: 30590; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: true }
    readonly wa_web_channels_comet_video_player_enabled: { readonly code: 24037; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
    readonly web_test_use_case_client_group: { readonly code: 25322; readonly type: "bool"; readonly defaultValue: false; readonly debugDefaultValue: false }
}

export declare const WA_ABPROPS_BY_CODE: {
    readonly 175: "status_video_max_duration"
    readonly 247: "upload_document_thumb_mms_enabled"
    readonly 249: "download_status_thumb_mms_enabled"
    readonly 250: "download_document_thumb_mms_enabled"
    readonly 310: "md_icdc_hash_length"
    readonly 451: "smb_collections_enabled"
    readonly 522: "joinable_client_poll_interval_min"
    readonly 536: "disappearing_mode"
    readonly 600: "web_abprop_drop_full_history_sync"
    readonly 726: "drop_last_name"
    readonly 730: "num_days_key_index_list_expiration"
    readonly 731: "num_days_before_device_expiry_check"
    readonly 741: "web_abprop_collections_nux_banner"
    readonly 764: "web_abprop_business_profile_refresh_linked_account_enabled"
    readonly 791: "tos_3_client_gating_enabled"
    readonly 865: "tctoken_duration"
    readonly 869: "web_abprop_direct_connection_md"
    readonly 877: "tos_client_state_fetch_enabled"
    readonly 894: "web_abprop_block_catalog_creation_ecommerce_compliance_india"
    readonly 908: "tos_client_state_fetch_iteration"
    readonly 909: "tctoken_num_buckets"
    readonly 957: "banned_shops_ux_enabled"
    readonly 976: "ctwa_tos_filtering_enabled"
    readonly 982: "parent_group_view_enabled"
    readonly 996: "tctoken_duration_sender"
    readonly 997: "tctoken_num_buckets_sender"
    readonly 1003: "smb_ecommerce_compliance_india_m4"
    readonly 1015: "smart_filters_enabled"
    readonly 1031: "in_app_support_v2_number_prefixes"
    readonly 1035: "system_msg_numbers_fb_branded"
    readonly 1036: "system_msg_numbers_fb_inc"
    readonly 1053: "web_shop_storefront_message"
    readonly 1064: "dev_prop_string"
    readonly 1065: "dev_prop_boolean"
    readonly 1066: "dev_prop_int"
    readonly 1067: "dev_prop_float"
    readonly 1104: "lthash_check_hours"
    readonly 1105: "country_client_gating_enabled"
    readonly 1107: "order_details_from_cart_enabled"
    readonly 1133: "interactive_message_native_flow_killswitch"
    readonly 1135: "message_count_logging_md_enabled"
    readonly 1171: "web_init_chat_batch_size"
    readonly 1172: "web_init_chat_max_unread_message_count"
    readonly 1176: "order_details_custom_item_enabled"
    readonly 1188: "order_management_enabled"
    readonly 1190: "log_clock_skew"
    readonly 1192: "smb_ecommerce_compliance_india_m4_5"
    readonly 1203: "smb_hide_unsupported_currency_price"
    readonly 1212: "order_details_from_catalog_enabled"
    readonly 1213: "audio_level_speaking_threshold"
    readonly 1229: "smb_catkit_query_version"
    readonly 1238: "parent_group_link_limit"
    readonly 1287: "smart_filters_enabled_consumer"
    readonly 1304: "group_size_limit"
    readonly 1319: "commerce_sanctioned"
    readonly 1351: "web_abprop_business_profile_refresh_linked_accounts_killswitch"
    readonly 1379: "md_app_state_gate_D34336913"
    readonly 1400: "syncd_periodic_sync_days"
    readonly 1406: "poll_name_length"
    readonly 1407: "poll_option_length"
    readonly 1408: "poll_option_count"
    readonly 1410: "poll_cleanup_days"
    readonly 1430: "heartbeat_interval_s"
    readonly 1435: "interactive_response_message_killswitch"
    readonly 1513: "web_syncd_max_mutations_to_process_during_resume"
    readonly 1514: "catalog_categories_enabled"
    readonly 1517: "md_offline_v2_m2_enabled"
    readonly 1565: "lobby_timeout_min"
    readonly 1583: "smb_billing_enabled"
    readonly 1600: "order_details_quick_pay"
    readonly 1608: "chatlist_filters_v1"
    readonly 1655: "parent_group_admins_limit"
    readonly 1670: "dm_updated_system_message"
    readonly 1680: "web_abprop_screen_lock_enabled"
    readonly 1681: "wa_ctwa_log_user_journey_enabled"
    readonly 1684: "order_details_total_maximum_value"
    readonly 1698: "keep_in_chat_undo_duration_limit"
    readonly 1719: "order_details_total_order_minimum_value"
    readonly 1745: "web_group_profile_editor"
    readonly 1753: "web_abprop_core_wam_runtime"
    readonly 1773: "web_offline_resume_qpl_enabled"
    readonly 1777: "is_meta_employee_or_internal_tester"
    readonly 1783: "syncd_lthash_consistency_check_on_snapshot_mac_mismatch"
    readonly 1798: "smb_md_agent_chat_assignment_enabled"
    readonly 1808: "web_syncd_fatal_fields_from_L1104589PRV2"
    readonly 1834: "report_call_replayer_id"
    readonly 1838: "disable_auto_download"
    readonly 1841: "ctwa_data_max_length"
    readonly 1846: "direct_connection_business_numbers"
    readonly 1850: "web_multi_skin_toned_emoji_picker"
    readonly 1852: "status_reaction_emojis"
    readonly 1861: "group_size_bypassing_sampling"
    readonly 1864: "community_admin_promotion_one_time_prompt"
    readonly 1867: "share_phone_number_on_cart_send_to_direct_connection_biz_enabled"
    readonly 1897: "smb_multi_device_agents_logging_V2_enabled"
    readonly 1902: "web_ptt_streamer_upload"
    readonly 1913: "smb_temp_cover_photo_privacy_messaging"
    readonly 1981: "smb_multi_device_message_attribution_enabled"
    readonly 1990: "parent_group_link_limit_community_creation"
    readonly 2014: "graphql_locale_remapping"
    readonly 2016: "web_message_list_a11y_redesign"
    readonly 2018: "web_enable_profile_pic_thumb_db_caching"
    readonly 2056: "web_enable_biz_catalog_view_ps_logging"
    readonly 2057: "group_suspend_appeal_include_entity_id_enabled"
    readonly 2063: "web_abprop_media_links_docs_search"
    readonly 2134: "mms_vcache_aggregation_enabled"
    readonly 2156: "web_link_preview_sync_enabled"
    readonly 2158: "smb_ctwa_billing_enabled"
    readonly 2167: "video_stream_buffering_ui_enabled"
    readonly 2205: "parent_group_view_enabled_for_smb_on_web"
    readonly 2207: "smb_md_agent_chat_assignment_nux_impressions"
    readonly 2249: "mex_phase3_enabled"
    readonly 2250: "mex_phase3_status_flags"
    readonly 2264: "web_max_contacts_to_show_common_groups"
    readonly 2268: "web_max_found_common_groups_displayed"
    readonly 2280: "web_message_custom_aria_label"
    readonly 2356: "parent_group_create_privacy"
    readonly 2378: "four_reactions_in_bubble_enabled"
    readonly 2382: "parent_group_min_participants_for_group_entry_point"
    readonly 2449: "group_join_request_m2_banner_on_conversation"
    readonly 2508: "web_non_blocking_offline_resume_max_message_count"
    readonly 2553: "new_end_call_survey_pop_up_user_interval_s"
    readonly 2561: "out_of_sync_disappearing_messages_logging"
    readonly 2566: "link_preview_wait_time"
    readonly 2582: "smb_biz_profile_custom_url"
    readonly 2601: "enable_init_bwe_for_group_call"
    readonly 2614: "media_picker_select_limit"
    readonly 2622: "web_screen_lock_max_retries"
    readonly 2639: "placeholder_message_key_hash_logging"
    readonly 2642: "vid_stream_pause_resume_jb_reset_threshold_ms"
    readonly 2693: "media_picker_select_limit_new"
    readonly 2709: "smb_md_agent_chat_assignment_system_messages_logging_v2_enabled"
    readonly 2714: "ephemeral_sync_response"
    readonly 2737: "poll_receiving_cag_enabled"
    readonly 2738: "poll_creation_cag_enabled"
    readonly 2774: "community_announcement_group_size_limit"
    readonly 2776: "fullscreen_animation_for_keyword"
    readonly 2777: "syncd_additional_mutations_count"
    readonly 2787: "smb_md_agent_chat_assignment_chats_reorder_on_chat_assignment_enabled"
    readonly 2788: "smb_md_agent_chat_assignment_chats_reorder_on_chat_unassignment_enabled"
    readonly 2793: "web_message_plugin_frontend_registration_enabled"
    readonly 2832: "enable_soox_message_sending"
    readonly 2844: "supports_keep_in_chat_in_cag"
    readonly 2856: "unify_end_call_events"
    readonly 2895: "utm_tracking_enabled"
    readonly 2896: "utm_tracking_expiration_hours"
    readonly 2898: "wa_ctwa_web_thread_ad_attribution_enabled"
    readonly 2904: "elevated_push_names_v2_m2_enabled"
    readonly 2908: "smb_md_agent_chat_assignment_notifications_enabled"
    readonly 2912: "call_admin_version"
    readonly 2915: "maximum_group_size_for_rcat"
    readonly 2934: "ctwa_smb_data_sharing_consent"
    readonly 2945: "is_internal_tester"
    readonly 2983: "message_edit_window_duration_seconds"
    readonly 3011: "ugc_enabled"
    readonly 3031: "web_native_fetch_media_download"
    readonly 3042: "web_image_max_edge"
    readonly 3051: "payments_link_to_lite_consumer_enabled"
    readonly 3058: "wa_ctwa_web_entrypoint_home_header_enabled"
    readonly 3062: "pnh_pn_for_lid_chat_sync"
    readonly 3068: "original_quality_image_min_edge"
    readonly 3069: "send_cag_member_revokes_as_GDM"
    readonly 3070: "share_own_pn_sync"
    readonly 3081: "external_beta_can_join"
    readonly 3094: "security_fixes_bitmap"
    readonly 3095: "wa_ctwa_web_entrypoint_home_header_dropdown_enabled"
    readonly 3115: "media_large_file_awareness_popup_file_size_in_MB"
    readonly 3124: "smb_rambutan_enabled"
    readonly 3133: "web_store_quota_manager_enabled"
    readonly 3134: "web_browser_quota_threshold"
    readonly 3135: "web_browser_min_storage_quota"
    readonly 3136: "web_original_photo_quality_upload_enabled"
    readonly 3138: "pinned_messages_m0"
    readonly 3139: "pinned_messages_m1_receiver"
    readonly 3140: "pinned_messages_m1_sender"
    readonly 3141: "pinned_messages_m2"
    readonly 3147: "parent_group_subgroup_filter"
    readonly 3152: "web_deprecate_mms4_hash_based_download"
    readonly 3180: "group_suspend_v2_enabled"
    readonly 3182: "enable_chat_psa_auto_play_videos"
    readonly 3185: "default_video_limit_mb"
    readonly 3204: "web_image_max_hd_edge"
    readonly 3205: "device_switching_enabled"
    readonly 3211: "extensions_user_report_store_max_data_exchanges_per_session"
    readonly 3212: "extensions_user_report_store_max_data_max_sessions_per_message"
    readonly 3234: "web_e2e_backfill_expire_time"
    readonly 3235: "enable_silent_offer"
    readonly 3240: "order_messages_ephemeral_exception_enabled"
    readonly 3272: "message_edit_client_entry_point_limit_seconds"
    readonly 3280: "send_extended_nack_enabled"
    readonly 3285: "smb_waldo_service_offerings_selection_enabled"
    readonly 3294: "wa_ctwa_web_fetch_linked_accounts_enabled"
    readonly 3305: "dm_additional_durations"
    readonly 3322: "enable_days_since_receive_logging"
    readonly 3331: "ctwa_smb_data_sharing_opt_in_cool_off_period"
    readonly 3337: "history_sync_on_demand"
    readonly 3350: "wds_radius_and_casing"
    readonly 3356: "ptv_max_duration_seconds"
    readonly 3358: "calling_lid_version"
    readonly 3376: "wa_ctwa_web_entrypoint_manage_ads_home_header_dropdown_enabled"
    readonly 3467: "smb_project_waldo_set_price_tier_biz_profile_enabled"
    readonly 3482: "ptv_autoplay_enabled"
    readonly 3483: "ptv_autoplay_loop_limit"
    readonly 3522: "youtube_inline_playback_killswitch"
    readonly 3536: "qp_campaign_client_enabled"
    readonly 3575: "animated_emojis_enabled"
    readonly 3579: "placeholder_message_resend"
    readonly 3631: "coupon_copy_button_url"
    readonly 3639: "placeholder_message_resend_maximum_days_limit"
    readonly 3657: "default_audio_limit_mb"
    readonly 3659: "default_status_media_limit_mb"
    readonly 3660: "default_media_limit_mb"
    readonly 3664: "service_improvement_opt_out_flag"
    readonly 3682: "gif_min_play_loops"
    readonly 3683: "gif_max_play_loops"
    readonly 3684: "gif_max_play_duration"
    readonly 3690: "orders_expansion_receiver_countries_allowed"
    readonly 3694: "max_num_participants_for_ss"
    readonly 3695: "report_to_admin_kill_switch"
    readonly 3696: "report_to_admin_enabled"
    readonly 3728: "web_message_processing_cache_size"
    readonly 3732: "pinned_messages_m2_pin_max"
    readonly 3744: "payments_merchant_global_orders_value_props_banner_enabled"
    readonly 3810: "newsletter_tos_notice_id"
    readonly 3811: "history_sync_on_demand_message_count"
    readonly 3827: "unified_otp_copy_code_url"
    readonly 3828: "unified_otp_retriever_url"
    readonly 3834: "newsletter_creation_tos_id"
    readonly 3835: "newsletter_creation_nux_id"
    readonly 3860: "ts_session_duration_ms"
    readonly 3877: "channels_enabled"
    readonly 3878: "channels_creation_enabled"
    readonly 3879: "channels_directory_enabled"
    readonly 3882: "history_sync_on_demand_timeout_ms"
    readonly 3919: "channel_supported_message_types"
    readonly 3995: "privacy_tips_groups_build"
    readonly 3998: "privacy_tips_profile_build"
    readonly 4010: "bonsai_enabled"
    readonly 4067: "cloud_api_calling_alpha_ui_enabled"
    readonly 4118: "ugc_participant_limit"
    readonly 4135: "history_sync_on_demand_with_android_beta"
    readonly 4171: "hd_video_definition_min_edge"
    readonly 4172: "hd_video_definition_max_edge"
    readonly 4175: "hd_video_definition_min_edge_with_max_edge"
    readonly 4190: "group_call_max_participants"
    readonly 4248: "payments_br_content_optimization_variant"
    readonly 4295: "p2m_external_payments_link_enabled"
    readonly 4306: "channel_reactions_enabled"
    readonly 4309: "recommended_channels_background_refresh"
    readonly 4314: "privacy_tips_killswitch"
    readonly 4326: "channel_pull_message_updates_threshold_seconds"
    readonly 4338: "channel_forward_to_chat_enabled"
    readonly 4349: "enable_ml_bwe_model_download"
    readonly 4364: "history_sync_on_demand_failure_limit"
    readonly 4365: "history_sync_on_demand_cooldown_sec"
    readonly 4416: "bonsai_ptt_enabled"
    readonly 4417: "bonsai_update_interval"
    readonly 4427: "business_tool_enhanced_logging"
    readonly 4432: "pinned_messages_sender_short_expiry_durations_enabled"
    readonly 4495: "pnh_cag_disable_reactions_group_size"
    readonly 4532: "bonsai_avatar_enabled"
    readonly 4542: "in_app_comms_manage_ads_web_banner_campaign_enabled"
    readonly 4579: "add_member_system_message"
    readonly 4596: "web_premium_messages_interactivity_rendering_enabled"
    readonly 4648: "channel_views_duration_milliseconds"
    readonly 4657: "smb_premium_messages_click_logging_enabled"
    readonly 4659: "enable_clear_formatted_preview"
    readonly 4668: "carousel_message_client_enabled"
    readonly 4681: "web_internal_in_app_bug_reporting_enable"
    readonly 4682: "channel_forward_to_chat_v2_message_navigation_enabled"
    readonly 4710: "max_group_size_for_long_ringtone"
    readonly 4721: "channel_view_counts_enabled"
    readonly 4722: "channel_playable_message_views_duration_milliseconds"
    readonly 4726: "web_sticker_suggestions_enable"
    readonly 4736: "bonsai_ti_timeout_duration_ms"
    readonly 4746: "username_contact_display"
    readonly 4760: "channels_send_view_receipt_enabled"
    readonly 4799: "in_app_support_capi_number_prefixes"
    readonly 4801: "enable_uwp_share_any_window"
    readonly 4812: "enable_cached_media_manager"
    readonly 4836: "low_cache_hit_rate_media_types"
    readonly 4849: "wae_metadata_integrity_timeout_minutes"
    readonly 4873: "wabai_message_rendering_enabled"
    readonly 4887: "channel_reactions_settings_enabled"
    readonly 4893: "row_buyer_order_revamp_m0_enabled"
    readonly 4929: "ts_surface_killswitch"
    readonly 4974: "bonsai_word_streaming_enabled"
    readonly 4991: "enable_spam_report_iq_with_privacy_token"
    readonly 4992: "enable_privacy_token_with_timestamp"
    readonly 5009: "smb_labels_ctwa_data_sharing"
    readonly 5015: "channels_filter_out_subscribed_in_directory_null_state"
    readonly 5021: "community_general_chat_UI_enabled"
    readonly 5044: "smb_premium_messages_url_cta_alert_dialog_enabled"
    readonly 5053: "enable_lazy_loading_of_call_view_elements"
    readonly 5056: "pnh_cag_disable_polls_group_size"
    readonly 5077: "parent_group_allow_member_suggest_existing_m3_sender"
    readonly 5078: "parent_group_allow_member_suggest_existing_m3_receiver"
    readonly 5079: "web_preload_chat_messages"
    readonly 5106: "web_noncritical_history_sync_message_processing_break_iteration"
    readonly 5110: "web_tc_token_db_read_enabled"
    readonly 5114: "buyer_initiated_order_request_variant_enabled"
    readonly 5127: "channels_directory_v2_filter_types"
    readonly 5171: "inbox_filters_enabled"
    readonly 5185: "channel_reactions_sender_list_enabled"
    readonly 5190: "seller_orders_management_revamp"
    readonly 5204: "channels_directory_search_debounce_ms"
    readonly 5215: "wabai_message_feedback_enabled"
    readonly 5217: "channels_followers_list_cache_refresh_milliseconds"
    readonly 5228: "wavoip_ml_bwe_plc_model_download_versions"
    readonly 5231: "wavoip_ml_bwe_undershoot_model_download_versions"
    readonly 5271: "web_offline_dynamic_batch_size_enabled"
    readonly 5276: "blue_enabled"
    readonly 5283: "bonsai_carousel_enabled"
    readonly 5287: "channels_hide_news_url_preview"
    readonly 5295: "blue_education_enabled"
    readonly 5297: "web_offline_dynamic_batch_config"
    readonly 5304: "channels_directory_v2_cache_refresh_interval_ms"
    readonly 5308: "win_call_log_send_outgoing_syncd_mutations"
    readonly 5318: "premium_blue_enabled"
    readonly 5333: "extensions_geoblocking_enabled"
    readonly 5347: "web_evolve_about_send_enabled"
    readonly 5360: "enable_turn_on_call_notification_reminders"
    readonly 5453: "community_general_chat_create_enabled"
    readonly 5491: "channels_share_link_logging_enabled"
    readonly 5492: "channels_forward_logging_v2_enabled"
    readonly 5494: "channels_max_messages_batch_pull"
    readonly 5502: "web_resume_optimized_read_receipt_send_interval"
    readonly 5580: "dm_reliability_logging"
    readonly 5597: "newsletter_tos_notice_id_smb_web"
    readonly 5598: "newsletter_creation_tos_id_smb_web"
    readonly 5615: "ctwa_smb_data_sharing_settings_killswitch"
    readonly 5626: "saga_enabled"
    readonly 5637: "bonsai_english_only"
    readonly 5643: "channels_send_album_enabled"
    readonly 5718: "rt_receive_reporting_tag"
    readonly 5746: "wabai_consent_cooldown"
    readonly 5747: "wabai_consent_required"
    readonly 5765: "inbox_filters_reset_timeout"
    readonly 5770: "order_statuses_revamp_m1_enabled"
    readonly 5813: "parent_group_announcement_comments_history_sync_receiver_enabled"
    readonly 5839: "evolve_about_m1_receiver_enabled"
    readonly 5846: "blue_strings_enabled"
    readonly 5853: "channels_directory_page_size"
    readonly 5869: "mm_data_sharing_disclosure_enabled"
    readonly 5871: "channels_proactive_message_gap_handling_enabled"
    readonly 5876: "channels_ptt_receiver_enabled"
    readonly 5985: "bot_3p_status"
    readonly 5990: "data_sharing_transparency_indicator_duration"
    readonly 6007: "callee_accept_timeout_ms"
    readonly 6046: "unified_poll_vote_addon_infra_enabled"
    readonly 6052: "inbox_filters_haptic_feedback_enabled"
    readonly 6061: "fmx_ctwa_kill_switch"
    readonly 6127: "blue_education_v2_enabled"
    readonly 6145: "dsa_channels_report_unlawful_content_enabled"
    readonly 6153: "text_status_ttl_seconds_allowlist"
    readonly 6172: "evolve_about_m1_receiver_for_new_surfaces_enabled"
    readonly 6191: "channels_poll_receive_enabled"
    readonly 6207: "event_name_length_limit"
    readonly 6208: "event_description_length_limit"
    readonly 6214: "ctwa_entry_point_config_fetch_threshhold"
    readonly 6215: "kill_switch_ctwa_ml_entry_point_config"
    readonly 6216: "enable_ctwa_ml_entry_point_config"
    readonly 6246: "system_msg_text_styling"
    readonly 6251: "bonsai_chat_list_entry_point_enabled"
    readonly 6274: "channels_ptt_logging_enabled"
    readonly 6332: "web_material_refresh"
    readonly 6337: "blue_profile_locked_ui_enabled"
    readonly 6382: "channels_poll_voter_list_enabled"
    readonly 6444: "channels_status_updates_consumption_enabled"
    readonly 6458: "bonsai_carousel_reels_profile_photo_enabled"
    readonly 6459: "bonsai_carousel_hq_thumbnail_enabled"
    readonly 6461: "channels_multi_admin_max_admin_count"
    readonly 6498: "newsletter_admin_invite_tos_id"
    readonly 6505: "channels_audio_files_sender_enabled"
    readonly 6506: "channels_audio_files_receiver_enabled"
    readonly 6536: "newsletter_admin_invite_tos_id_smb_web"
    readonly 6578: "rt_sync_reporting_tag"
    readonly 6598: "calling_audio_share_version"
    readonly 6614: "enable_syncd_debug_data_in_patch"
    readonly 6619: "web_jpeg_quality"
    readonly 6656: "web_pwa_background_sync"
    readonly 6665: "web_design_refresh"
    readonly 6670: "order_details_payment_instructions_sync_enabled"
    readonly 6693: "smba_premium_messages_leaving_wa_content"
    readonly 6706: "web_pwa_background_sync_min_interval_hours"
    readonly 6723: "rt_clean_reporting_tag"
    readonly 6785: "gimmick_phase_two_data_suffix"
    readonly 6791: "lid_status_send_enabled"
    readonly 6803: "web_business_tools_drawer_enabled"
    readonly 6816: "is_pmx_funnel_metrics_logging_enabled"
    readonly 6837: "is_pmx_hashed_msg_key_logging_enabled"
    readonly 6843: "data_privacy_phase_2_enabled"
    readonly 6858: "web_intern_dogfooding_upsell_enabled"
    readonly 6859: "web_intern_dogfooding_upsell_snooze_duration"
    readonly 6860: "web_intern_dogfooding_upsell_content"
    readonly 6939: "adv_accept_hosted_devices"
    readonly 6943: "channels_audio_files_sender_waveform_enabled"
    readonly 6967: "inbox_filters_read_unread_logging_enabled"
    readonly 6996: "channels_audio_files_display_waveform_enabled"
    readonly 7024: "payments_br_pix_phase_1_seller_sync_enabled"
    readonly 7044: "saga_copy"
    readonly 7080: "support_message_feedback_enabled"
    readonly 7108: "inbox_filters_smb_enabled"
    readonly 7131: "data_privacy_phase_2_non_e2ee_enabled"
    readonly 7141: "dm_initiator_trigger_groups"
    readonly 7177: "enable_product_carousel_message"
    readonly 7211: "channels_admin_reply_enabled"
    readonly 7234: "channels_quick_forwarding_button_mode"
    readonly 7237: "channels_admin_reply_receiver_enabled"
    readonly 7267: "favorites_limit"
    readonly 7281: "web_disable_sw_on_safari_pwa"
    readonly 7287: "visible_message_drop_placeholder_enabled_internal_only"
    readonly 7300: "enable_force_voip_logging"
    readonly 7301: "native_contact_companion_change_enabled"
    readonly 7356: "web_recent_sync_chunk_download_optimization"
    readonly 7402: "dm_initiator_trigger_daily_logs"
    readonly 7422: "web_autodownload_stickers"
    readonly 7463: "custom_racing_emoji"
    readonly 7467: "pinned_messages_m2_image_thumbnail"
    readonly 7468: "username_security_code_generation"
    readonly 7472: "similar_channels_in_thread_on_follow_enabled"
    readonly 7473: "similar_channels_in_channel_details_enabled"
    readonly 7510: "events_m3_cover_image_send"
    readonly 7511: "events_m3_cover_image_receive"
    readonly 7546: "web_payment_notifications_ack_kick_fix_enabled"
    readonly 7559: "similar_channels_max_limit"
    readonly 7560: "similar_channels_min_limit"
    readonly 7567: "addon_infra_enable_perf_logging"
    readonly 7592: "dsa_information_for_eu_only_enabled"
    readonly 7634: "profile_picture_deeplink_enabled"
    readonly 7637: "inbox_filters_custom_smb_enabled"
    readonly 7640: "sticker_discovery_enabled_m1"
    readonly 7645: "smb_graphql_to_fetch_qp_enabled"
    readonly 7646: "smb_graphql_to_fetch_qp_frequency_mins"
    readonly 7647: "smb_graphql_to_fetch_qp_surface_ids"
    readonly 7677: "channels_qpl_logging"
    readonly 7682: "channels_reactions_bottomsheet_tap_to_react_enabled"
    readonly 7685: "channels_directory_categories_enabled"
    readonly 7709: "calling_32p_version"
    readonly 7734: "channels_directory_category_types"
    readonly 7737: "win_network_state_watchdog_interval"
    readonly 7769: "inbox_filters_suppress_contact_filter"
    readonly 7820: "single_e2ee_session_migration_state_outgoing"
    readonly 7821: "single_e2ee_session_migration_state_incoming"
    readonly 7848: "bonsai_supported_languages"
    readonly 7854: "web_comms_socket_reconnect_enabled"
    readonly 7857: "payments_br_pix_quick_reply_enabled"
    readonly 7865: "web_message_drop_bulk_db_operation_fallback_enabled"
    readonly 7869: "status_mentions_receiver"
    readonly 7886: "enable_sticker_verification_for_gimmick"
    readonly 7902: "status_video_playback_max_duration_second"
    readonly 7919: "channels_poll_voters_summary_cache_ttl_ms"
    readonly 7920: "channels_poll_voters_details_cache_ttl_ms"
    readonly 7976: "meta_verified_badge_education_vai_content"
    readonly 7986: "directory_categories_newsletters_per_category_limit"
    readonly 8004: "bonsai_meta_ai_shortcut_tos_enabled"
    readonly 8015: "ctwa_long_term_holdout_content_enabled"
    readonly 8019: "web_socket_parallel_connection_enabled"
    readonly 8025: "ai_search_experience_enabled"
    readonly 8026: "ai_search_null_state_enabled"
    readonly 8059: "channels_verified_badge_in_compact_inbox_enabled"
    readonly 8076: "ai_search_max_num_suggestions"
    readonly 8082: "xplat_attachment_format_check_v2"
    readonly 8100: "ai_search_null_state_update_interval"
    readonly 8115: "web_sticky_hd_photo_setting_enabled"
    readonly 8147: "app_exit_reason_version"
    readonly 8151: "channels_directory_categories_cache_refresh_interval_ms"
    readonly 8160: "br_enable_payment_logos_on_bubble"
    readonly 8166: "ctwa_ad_account_token_storage_kill_switch_web"
    readonly 8167: "channels_recommended_v3_ui_limit"
    readonly 8171: "search_the_web_dialog_redesign"
    readonly 8172: "web_larger_link_previews"
    readonly 8175: "calling_ux_logging_bitmap"
    readonly 8180: "enable_lid_call_link"
    readonly 8198: "discovery_sticker_packs_count"
    readonly 8227: "channel_to_channel_forwarding_logging_enabled"
    readonly 8313: "smb_meta_verified_context_card"
    readonly 8327: "report_block_improvements_for_groups_enabled"
    readonly 8353: "web_pending_message_cache_enabled"
    readonly 8406: "web_offline_message_processor_timeout_seconds"
    readonly 8407: "ai_search_null_state_row_count"
    readonly 8421: "mex_usync_username_query"
    readonly 8454: "windows_graceful_degradation_version"
    readonly 8458: "webc_page_load_early_commit_enabled"
    readonly 8473: "search_the_web_url_offer"
    readonly 8505: "biz_ai_smb_agents_automatic_reply_enabled"
    readonly 8524: "enable_call_control_m5"
    readonly 8528: "album_v2_receiving_enabled"
    readonly 8529: "album_v2_sender_enabled"
    readonly 8580: "web_communities_general_chat_v_2"
    readonly 8582: "unified_session_log_call_event"
    readonly 8627: "text_user_journey_logging_wam_enabled"
    readonly 8630: "ptt_user_journey_logging_wam_enabled"
    readonly 8653: "channels_updates_tab_swipe_actions_enabled"
    readonly 8663: "ctwa_ad_account_nonce_retries_max_web"
    readonly 8664: "ctwa_ad_account_nonce_push_wait_timeout_web"
    readonly 8685: "ai_metabot_send_image_limit"
    readonly 8742: "status_poster_side_gating_enabled"
    readonly 8763: "username_mex_account_sync_enabled"
    readonly 8782: "web_background_sync_v2"
    readonly 8783: "message_association_infra_enabled"
    readonly 8785: "lid_migration_notifications_enabled"
    readonly 8800: "graphql_get_product_list"
    readonly 8860: "rt_sender_reporting_token_version"
    readonly 8910: "enable_minimize_individual_mutation_write"
    readonly 8953: "payments_br_force_copy_pix_cta_enabled"
    readonly 8960: "channels_producer_insights_enabled"
    readonly 8969: "smb_payment_links_url_regex_list"
    readonly 9017: "payments_br_copy_pix_code_api_merchant_enabled"
    readonly 9069: "enable_chat_list_sticker_emojis"
    readonly 9077: "lazy_system_message_insertion_enabled"
    readonly 9157: "flows_termination_message_v2_sending_enabled"
    readonly 9163: "ai_metabot_image_input_languages"
    readonly 9197: "smb_graphql_token_recovery_during_account_recovery_enabled"
    readonly 9211: "hash_identity_keys_for_qr_code_device_verification"
    readonly 9213: "smb_payment_links_logging_enabled"
    readonly 9292: "verified_badge_in_chats_list_enabled"
    readonly 9312: "directory_categories_display_newsletters_per_category_limit"
    readonly 9348: "optimized_delivery_signal_collection_enabled"
    readonly 9379: "ai_reminders_enabled"
    readonly 9422: "channel_forward_bottom_button_enabled"
    readonly 9428: "mex_group_get_group_info_by_invite_code"
    readonly 9435: "lid_one_on_one_migration_enabled"
    readonly 9447: "channels_producer_insights_min_followers"
    readonly 9482: "ai_pdfn_tos_shortcut_notice_id"
    readonly 9483: "ai_pdfn_tos_invoke_notice_id"
    readonly 9502: "voip_call_coordinator_version"
    readonly 9522: "status_future_proofing"
    readonly 9524: "mex_usync_about_status"
    readonly 9541: "bonsai_fp_ugc_sender"
    readonly 9547: "search_the_web_image_search"
    readonly 9548: "search_the_web_text_search"
    readonly 9567: "rt_clean_reporting_token"
    readonly 9596: "ctwa_ad_creation_entry_point_catalog_web"
    readonly 9601: "ai_experiment_graphql_config"
    readonly 9633: "win_enable_ss_button_audio"
    readonly 9641: "channels_admin_insights_gizmos_enabled"
    readonly 9668: "profile_scraping_privacy_token_in_about_iq"
    readonly 9669: "single_emoji_logging_enabled"
    readonly 9674: "enable_busy_reason_fs"
    readonly 9677: "ctwa_ad_creation_entry_point_catalog_product_web"
    readonly 9694: "ai_ptt_main_gate_supported_languages"
    readonly 9729: "wa_ctwa_web_hide_ad_context_if_soft_dismissed_in_primary"
    readonly 9757: "animated_emoji_final_set_enabled"
    readonly 9758: "animated_emoji_set_1_enabled"
    readonly 9792: "channels_producer_insights_hide_deltas"
    readonly 9818: "rt_report_token_from_inclusion_list"
    readonly 9833: "whatsapp_vpv_logging_enabled"
    readonly 9834: "channels_vpv_logging_enabled"
    readonly 9876: "brigading_privacy_setting_enabled"
    readonly 9924: "saga_v1_reengagement_enabled"
    readonly 9932: "events_create_cag_enabled"
    readonly 9942: "saga_v1_enabled"
    readonly 9944: "saga_v1_nux_enabled"
    readonly 10011: "mm_message_level_feedback_enabled"
    readonly 10051: "wa_web_calling_deep_link_error"
    readonly 10103: "enable_ring_for_gc_on_offer_expire"
    readonly 10188: "channels_directory_categories_logging_enabled"
    readonly 10230: "enable_wefr_client_expo_pulse"
    readonly 10272: "smb_notes_content_max_limit"
    readonly 10273: "ignore_one_to_one_terminate_in_group_call"
    readonly 10302: "optimized_delivery_signal_collection_config"
    readonly 10303: "optimized_delivery_tokens_storage_config"
    readonly 10325: "channels_fetch_and_log_capabilities"
    readonly 10328: "channels_capabilities_enabled"
    readonly 10379: "ctwa_mm_biz_ai_disclosure_update_enabled"
    readonly 10389: "smb_payment_links_seller_logging_enabled"
    readonly 10412: "channel_poll_forwarding_enabled"
    readonly 10416: "enable_uwp_device_switch_banner"
    readonly 10438: "reaction_user_journey_logging_enabled"
    readonly 10455: "smb_agent_chat_list_indicator_enabled"
    readonly 10456: "smb_agent_thread_control_notification_enabled"
    readonly 10513: "channel_ptt_status_card_enabled"
    readonly 10518: "privacy_token_sending_on_all_1_on_1_messages"
    readonly 10559: "call_offer_failed_soft_landing_screen_version"
    readonly 10565: "enable_call_result_fix_for_404_accept_nack"
    readonly 10609: "saga_v1_carousel"
    readonly 10668: "mm_message_level_feedback_not_interested_menu_enabled"
    readonly 10725: "album_v2_forward_as_album_enabled"
    readonly 10842: "web_history_sync_allow_duplicate_in_bulk_error"
    readonly 10848: "album_v2_min_items_to_send_as_album_enabled"
    readonly 10966: "winrt_renderer"
    readonly 10970: "wabba_receiver_enabled"
    readonly 10975: "music_ohai_proxy_url"
    readonly 10978: "max_number_of_recent_contacts_shared_with_device"
    readonly 11000: "ctwa_long_term_holdout_client_side_check"
    readonly 11011: "web_adv_logout_on_self_device_list_expired"
    readonly 11017: "wamo_sub_logging_enabled_v2"
    readonly 11020: "wamo_sub_admin_enabled_v2"
    readonly 11021: "wamo_sub_consumer_enabled_v2"
    readonly 11029: "meta_catalog_linking_m2_enabled"
    readonly 11049: "lid_migration_for_vname_enabled"
    readonly 11062: "wamo_sub_messages_supported"
    readonly 11129: "default_endpoint_thread_poll_timeout"
    readonly 11168: "ai_home_bot_profile_sync_interval_sec"
    readonly 11192: "enable_channel_video_server_thumbnail"
    readonly 11205: "ctwa_custom_label_signals_enabled"
    readonly 11241: "mm_opt_out_enabled"
    readonly 11261: "privacy_token_sending_on_group_create"
    readonly 11262: "privacy_token_sending_on_group_participant_add"
    readonly 11426: "enable_new_ongoing_call_cell_ui"
    readonly 11454: "ml_model_download_skip_hash_check"
    readonly 11472: "sfu_secondary_remote_bwe_impl"
    readonly 11519: "ignore_joinable_terminate_on_expired_offer"
    readonly 11624: "smb_catalog_graphql_verify_postcode"
    readonly 11644: "native_contact_companion_nux_learn_more_article_id"
    readonly 11655: "external_ctx_authorise_wa_chat"
    readonly 11660: "ai_fbid_migration_receive_enabled"
    readonly 11671: "payments_br_p2m_boleto_enabled"
    readonly 11690: "smb_catalog_graphql_get_public_key"
    readonly 11700: "add_to_call_in_chat_thread"
    readonly 11756: "saga_protobuf_ai_stardust_web"
    readonly 11794: "username_engagement_network_impact_logging"
    readonly 11821: "syncd_mutation_and_bundle_logging"
    readonly 11832: "saga_protobuf_show_sysmsg_web"
    readonly 11836: "discovery_stickers_count"
    readonly 11891: "notification_highlight_group_size_threshold"
    readonly 11976: "futureproof_associated_child_enabled"
    readonly 11977: "use_signed_shimmed_url_link"
    readonly 11980: "channel_photo_poll_receiver_enabled"
    readonly 11989: "channel_photo_poll_sender_enabled"
    readonly 12000: "lid_migration_for_biz_profile_enabled"
    readonly 12020: "enable_group_create_or_add_rate_limiting_error_ux"
    readonly 12172: "mm_opt_out_fmx_stop_for_high_trust"
    readonly 12248: "ohai_request_kb_size"
    readonly 12254: "status_mentions_group_mention_receiver"
    readonly 12258: "poll_result_snapshot_polltype_envelope_enabled"
    readonly 12295: "channels_view_counts_vpv_logging_enabled"
    readonly 12390: "wam_disable_abkey_attribute"
    readonly 12391: "wam_disable_expokey_attribute"
    readonly 12509: "web_signal_future_messages_max"
    readonly 12520: "flows_wa_web"
    readonly 12538: "album_v2_min_items_to_send_album_with_caption"
    readonly 12539: "ai_rich_response_main_gate_enabled"
    readonly 12553: "otp_lid_migration_enabled"
    readonly 12623: "rt_sender_dual_encrypted_msg_enabled"
    readonly 12692: "ai_voice_multimodal_composer_enabled"
    readonly 12722: "wamo_sub_process_message_kill_switch"
    readonly 12726: "external_ctx_url_param_names"
    readonly 12761: "external_ctx_authorise_existing_chats"
    readonly 12795: "ai_fbid_migration_invoke_receive_enabled"
    readonly 12813: "media_viewer_accelerated_playback_enabled"
    readonly 12831: "web_dexie_hooks_support_enabled"
    readonly 12913: "reuse_cached_certs_for_data_channel"
    readonly 12985: "lid_group_creation_addressing_mode_override"
    readonly 12987: "channel_osa_reporting_enabled"
    readonly 12990: "private_osa_reporting_enabled"
    readonly 12993: "web_ui_refresh_m1"
    readonly 12994: "disclosure_for_the_marketing_message_body_links_enabled"
    readonly 12995: "shimmed_links_in_the_marketing_message_body_enabled"
    readonly 13063: "ft_validation_failure_drop_placeholder"
    readonly 13114: "wabba_save_to_camera_roll_enabled"
    readonly 13161: "lid_one_on_one_migration_compatible"
    readonly 13166: "early_audio_driver_capture_at_native"
    readonly 13168: "early_audio_driver_pre_buffering"
    readonly 13219: "channel_album_v2_receiving_enabled"
    readonly 13220: "channel_album_v2_sender_enabled"
    readonly 13231: "enable_audio_device_async_start"
    readonly 13240: "ctwa_enable_biz_data_sharing_after_nux_dismiss"
    readonly 13247: "ai_voice_entry_point_logging_enabled"
    readonly 13268: "anyone_can_link_to_groups"
    readonly 13280: "status_save_to_camera_roll_enabled"
    readonly 13322: "custom_racing_emoji_feb2025"
    readonly 13323: "emoji_search_cldr"
    readonly 13359: "enable_calling_username"
    readonly 13383: "per_customer_data_sharing_controls_eligible"
    readonly 13385: "ctwa_download_3pd_signals"
    readonly 13387: "smb_ai_agents_web_chat_assignment_interop_enabled"
    readonly 13415: "smb_product_country_of_origin_m1"
    readonly 13428: "use_cached_app_settings_from_global_ctx"
    readonly 13460: "rasterize_text_status_pixel_width"
    readonly 13464: "biz_ai_auto_save_enabled"
    readonly 13465: "biz_ai_coaching_enabled"
    readonly 13485: "ctwa_3pd_data_sharing_on_thread_entry"
    readonly 13490: "animated_race_mercedes_car_emoji_enabled"
    readonly 13497: "enable_unified_call_buttons_in_chat"
    readonly 13510: "mm_user_controls_exposure"
    readonly 13523: "member_name_tag_receiver_enabled"
    readonly 13524: "member_name_tag_sender_enabled"
    readonly 13540: "hand_raise_receiver_enabled"
    readonly 13542: "reactions_receiver_enabled"
    readonly 13559: "channels_ptv_receiving_enabled"
    readonly 13565: "external_ctx_foa_logging"
    readonly 13578: "ai_rich_response_grid_image_enabled"
    readonly 13579: "ctwa_show_ads_data_sharing_after_message"
    readonly 13597: "wa_web_fmx_agm_enabled"
    readonly 13679: "enable_call_links_push_notification"
    readonly 13692: "sticky_chat_profile_picture_enabled"
    readonly 13776: "channels_ptv_forwarding_enabled"
    readonly 13777: "channels_ptv_forwarding_to_status_enabled"
    readonly 13807: "enable_early_audio_driver_start"
    readonly 13808: "premium_broadcast_smb_capping_enabled"
    readonly 13856: "ai_account_linking_enabled"
    readonly 13874: "defense_mode_available"
    readonly 13879: "ai_forward_flow_surface_meta_ai_as_contact_enabled"
    readonly 13936: "lid_one_on_one_migration_peer_sync_timeout_in_seconds"
    readonly 13954: "newsletters_video_playback_wabba_logging_enabled"
    readonly 13956: "group_status_receiver_enabled"
    readonly 13970: "ai_pdfn_tos_inline_notices"
    readonly 13997: "updates_quick_promotion_banner_enabled"
    readonly 13999: "mm_user_controls_exception_number_prefixes"
    readonly 14064: "snapl_newsletter_logging_media_id_placeholder_string"
    readonly 14141: "ai_rich_response_web_structured_response_enabled"
    readonly 14199: "view_replies_infra_enabled"
    readonly 14200: "early_bot_connect_event_bitmap"
    readonly 14219: "ai_rewrite_enabled"
    readonly 14220: "ai_rewrite_supported_languages"
    readonly 14249: "channels_uk_osa_enabled"
    readonly 14250: "private_messaging_uk_osa_enabled"
    readonly 14260: "wa_web_favicons_update_m1"
    readonly 14279: "is_part_of_gsc_experiment"
    readonly 14286: "username_numeric_code_v4"
    readonly 14294: "web_catalog_recovery_flow_enabled"
    readonly 14300: "web_waffle"
    readonly 14303: "lid_trusted_token_issue_to_lid"
    readonly 14317: "support_lids"
    readonly 14333: "payment_support_lids"
    readonly 14343: "gif_provider"
    readonly 14358: "payment_br_holdout"
    readonly 14387: "updates_privacy_notice_rollout_date"
    readonly 14407: "render_updated_disclosure"
    readonly 14485: "syncd_sentinel_timeout_seconds"
    readonly 14488: "syncd_key_max_use_days"
    readonly 14492: "syncd_wait_for_key_timeout_days"
    readonly 14494: "syncd_inline_mutations_max_count"
    readonly 14495: "syncd_patch_protobuf_max_size"
    readonly 14565: "username_contact_usync_lid_based"
    readonly 14573: "enable_spam_reporting_pre_logging"
    readonly 14588: "optimized_delivery_multiple_collection_windows_enabled"
    readonly 14628: "smb_meta_ai_tos_notice_id"
    readonly 14641: "enable_ugc_voice_fs_logging"
    readonly 14664: "web_chat_info_action_buttons_refresh"
    readonly 14674: "hybrid_educational_dialogs_enabled"
    readonly 14675: "hybrid_educational_dialog_start_at"
    readonly 14682: "search_user_journey_logging_wam_enabled"
    readonly 14743: "ai_rewrite_tone_modifiers"
    readonly 14772: "mex_group_get_linked_group_info_enabled"
    readonly 14778: "group_description_length"
    readonly 14801: "group_max_subject"
    readonly 14881: "web_biz_profile_options"
    readonly 14887: "ctwa_custom_label_algorithm"
    readonly 14923: "ai_rewrite_entry_point_min_words"
    readonly 14924: "ai_rewrite_num_suggestions"
    readonly 14925: "ai_retrigger_null_state_main_gate_v2_enabled"
    readonly 14957: "smb_payment_links_cta_variant"
    readonly 14967: "smb_payment_links_cta_button_kill_switch"
    readonly 14985: "wamo_privacy_tos_linked_highlighted_notice_id"
    readonly 14987: "wamo_privacy_tos_unlinked_highlighted_notice_id"
    readonly 14998: "smb_payment_links_cta_psp_list"
    readonly 15016: "rt_edit_receive"
    readonly 15020: "harmful_file_dialog_logging"
    readonly 15127: "limit_sharing_enabled_for_1on1_chat"
    readonly 15129: "limit_sharing_protocol_message_receiver_enabled"
    readonly 15181: "rt_web_delay_processing"
    readonly 15184: "enable_auto_add_call_link_creator"
    readonly 15246: "channels_question_receiver_message_types_m1_enabled"
    readonly 15255: "newsletter_nux_notice_id"
    readonly 15256: "newsletter_admin_invite_nux_id"
    readonly 15258: "rt_receiver_dual_encrypted_msg_enabled"
    readonly 15271: "ctwa_important_label_sends_signals"
    readonly 15280: "ai_pdfn_tos_non_blocking_notices"
    readonly 15295: "ai_pdfn_tos_master_notice_id"
    readonly 15306: "genai_early_audio_pre_buf_size"
    readonly 15308: "ctwa_smb_detected_outcome_labels_merger_enabled"
    readonly 15311: "group_history_receive"
    readonly 15313: "group_history_send"
    readonly 15418: "channels_question_sender_message_types_m1_enabled"
    readonly 15423: "search_the_web_design_experiment_v1"
    readonly 15461: "enable_web_calling"
    readonly 15493: "username_adoption_and_engagement_monitoring_enabled"
    readonly 15501: "enable_hybrid_call_links_join"
    readonly 15502: "enable_hybrid_call_links_creation"
    readonly 15514: "enable_upcoming_schedule_call_events_in_calls_tab"
    readonly 15523: "biz_ai_in_thread_unmute_v2"
    readonly 15534: "web_catalog_viewing_variants_enabled"
    readonly 15557: "wa_web_growth_empty_state_upsell_variant_m1"
    readonly 15589: "ai_rich_response_reasoning_enabled"
    readonly 15653: "phone_number_sharing_flow"
    readonly 15686: "ctwa_3pd_data_sharing_cooldown_max_times_shown_for_opted_out"
    readonly 15694: "quoted_message_user_journey_logging_enabled"
    readonly 15722: "group_history_notice_receive"
    readonly 15740: "media_default_hd_upload_quality_enabled"
    readonly 15754: "channels_open_qpl_improvements_enabled"
    readonly 15772: "create_group_and_add_member_overflow"
    readonly 15884: "optimized_delivery_signal_collection_on_companions_enabled"
    readonly 15956: "username_search"
    readonly 15994: "enable_pre_warm_audio_component"
    readonly 16055: "forwarded_message_user_journey_logging_enabled"
    readonly 16057: "message_edit_to_message_secret_sender_enabled"
    readonly 16091: "ai_all_languages_enabled"
    readonly 16104: "lid_group_migration_non_member_iq"
    readonly 16138: "wa_web_debug_color_code_retry_messages"
    readonly 16148: "username_group_mutation_enabled"
    readonly 16156: "payments_br_pix_on_web"
    readonly 16161: "privacy_settings_profile_lid_migration_enable"
    readonly 16192: "group_create_add_using_lid_jids"
    readonly 16193: "channels_is_multi_admin_lid_migration_enabled"
    readonly 16195: "privacy_settings_about_lid_migration_enable"
    readonly 16201: "attach_transport_rtx"
    readonly 16208: "ai_search_bar_2025_redesign_enabled"
    readonly 16223: "web_mac_beta_upsell"
    readonly 16253: "schedule_call_show_join_button_time_interval_mins"
    readonly 16254: "schedule_call_show_upcoming_banner_time_interval_mins"
    readonly 16274: "privacy_settings_group_add_lid_migration_enable"
    readonly 16275: "privacy_settings_presence_lid_migration_enable"
    readonly 16329: "enable_peer_snapshot_recovery"
    readonly 16346: "group_history_bump_message_id"
    readonly 16376: "limit_sharing_update_enabled_web"
    readonly 16411: "show_integrity_screensharing_friction_ui"
    readonly 16420: "biz_ai_priority_list_enabled"
    readonly 16472: "biz_ai_priority_list_item_expire_days"
    readonly 16481: "voip_stack_incoming_message_ownership_transfer"
    readonly 16491: "channels_video_play_logging_enabled"
    readonly 16495: "username_prevent_pn_populate_new_contact_creation"
    readonly 16510: "ai_rewrite_in_expression_tray_enabled"
    readonly 16523: "enable_call_link_call_log_aggregation"
    readonly 16534: "rich_order_status_wa_web"
    readonly 16551: "member_name_tag_db_enabled"
    readonly 16632: "pnh_thread_promotion_to_general_lid"
    readonly 16681: "ai_rich_response_forward_sending_enabled"
    readonly 16682: "ai_rich_response_forward_receiving_enabled"
    readonly 16727: "mm_signal_sharing_verification_system_lid_enabled"
    readonly 16789: "channels_invite_contacts_to_follow_producer_enabled"
    readonly 16790: "channels_invite_contacts_to_follow_consumer_enabled"
    readonly 16792: "reactions_alignment_for_transparent_messages_enabled"
    readonly 16806: "wa_web_console_log_level"
    readonly 16834: "web_pdf_thumbnail_size_in_bytes"
    readonly 16856: "channels_sticker_forwarded_attribution_ui_enabled"
    readonly 16858: "channels_sticker_pack_forwarded_attribution_ui_enabled"
    readonly 16866: "payment_links_trust_signals_metatag_enabled"
    readonly 16931: "media_default_auto_download_quality_to_hd_for_dual_photo_enabled"
    readonly 16943: "ai_rewrite_stack_undo_enabled"
    readonly 16952: "mm_opt_out_lid_migration_enabled"
    readonly 16956: "web_offline_resume_wait_for_ping_timeout_seconds"
    readonly 16998: "view_replies_with_threadid_enabled"
    readonly 17052: "voice_chat_companion_experience_version"
    readonly 17071: "status_allow_forwarding_to_status_on_web"
    readonly 17081: "channels_emoji_forwarded_attribution_ui_enabled"
    readonly 17093: "biz_ai_web_ai_hub_tap_cta_show_alert"
    readonly 17104: "ai_simplified_profile_page_enabled"
    readonly 17162: "payment_links_trust_signals_metatag_psp_list"
    readonly 17198: "history_sync_on_demand_companion"
    readonly 17285: "ai_ugc_not_an_expert_enabled"
    readonly 17355: "payment_links_trust_signals_other_metatags_enabled"
    readonly 17408: "ai_rich_response_side_by_side_survey_enabled"
    readonly 17426: "channels_question_admin_enabled"
    readonly 17433: "smb_business_broadcast_import_contact"
    readonly 17479: "wa_web_hybrid_simple_chat_conversation_context_menu_enabled"
    readonly 17485: "bot_profile_sync_migration_enabled"
    readonly 17580: "ctwa_suppress_message_via_ad_spam_web"
    readonly 17600: "channels_questions_integrity_m1_enabled"
    readonly 17614: "username_contact_syncd_support_enable"
    readonly 17623: "ai_search_null_state_convo_starter_suggestions_update_interval"
    readonly 17630: "mm_data_sharing_disclosure_on_chat_open_enabled"
    readonly 17637: "hybrid_font_size_dropdown"
    readonly 17650: "wa_web_hybrid_context_menu_reactions_enabled"
    readonly 17685: "calling_voicemail_enabled"
    readonly 17698: "calls_tab_username_global_search_enabled"
    readonly 17712: "channels_open_qpl_user_rid_logging_enabled"
    readonly 17717: "hybrid_nux_beta_50_enabled"
    readonly 17724: "web_calls_tab_empty_state_buttons"
    readonly 17731: "enable_calling_phone_number_privacy"
    readonly 17743: "smba_business_broadcast_genai_text"
    readonly 17805: "ai_unified_response_mutation_enabled"
    readonly 17811: "message_edit_to_message_secret_receiver_enabled"
    readonly 17845: "wa_individual_new_chat_msg_capping_limit"
    readonly 17937: "smba_business_broadcast_recipient_limit"
    readonly 17954: "calling_rust_migration_bitmap"
    readonly 17956: "meta_ai_in_app_survey_enabled"
    readonly 17957: "ai_metabot_document_upload_enabled"
    readonly 18025: "advanced_chat_privacy_content_update_july_25"
    readonly 18047: "coex_calling_enabled"
    readonly 18066: "enable_grid_layout_tile_unification"
    readonly 18080: "hybrid_incremental_zooming_simple_enabled"
    readonly 18081: "enable_avatars_on_web_companion"
    readonly 18097: "pushname_blocklist_starting_with_at"
    readonly 18109: "internal_group_indicator"
    readonly 18114: "kaleidoscope_thumbnail_validation"
    readonly 18126: "mm_signal_sharing_collection_window_logging_enabled"
    readonly 18165: "enable_av_downgrade_1on1"
    readonly 18189: "dau_fix_delay_presence_on_focus"
    readonly 18204: "username_contact_ui_vcard"
    readonly 18229: "lists_smb_enabled"
    readonly 18251: "username_global_search_enabled"
    readonly 18262: "webview2_disable_gpu_acceleration"
    readonly 18286: "ai_forward_attribution_enabled"
    readonly 18297: "status_pog_id_rotation_window_days"
    readonly 18317: "group_history_sender_speed_bump_dialog_display_times"
    readonly 18339: "voicemail_nudge_duration_ms"
    readonly 18391: "history_sync_on_demand_time_boundary_days_desktops"
    readonly 18393: "channels_question_reply_receiver_message_types_m1_enabled"
    readonly 18394: "channels_question_reply_sender_message_types_m1_enabled"
    readonly 18397: "rt_message_drop_when_invalid"
    readonly 18405: "group_history_message_count_limit"
    readonly 18406: "group_history_messages_time_limit_secs"
    readonly 18489: "enable_new_user_action_stanza_for_raise_hand_sender"
    readonly 18560: "channels_admin_notifications_enabled"
    readonly 18613: "channels_creation_entrypoint_in_directory_enabled"
    readonly 18660: "web_disable_logs_low_end_device"
    readonly 18688: "dialer_pad_for_new_chats"
    readonly 18703: "rnr_days_cooldown"
    readonly 18736: "optimized_delivery_block_and_report_entry_points_allowlist_web"
    readonly 18737: "web_rating_and_review_contextual_prompt_enabled"
    readonly 18740: "ai_search_experience_web_enabled"
    readonly 18746: "ai_rich_response_ur_media_grid_enabled"
    readonly 18747: "web_low_end_device_level"
    readonly 18784: "ai_chat_meta_ai_banner_m2_enabled"
    readonly 18786: "snapshot_recovery_max_mutations_count_allowed"
    readonly 18835: "wa_web_falco_clear_local_storage_queue_enabled"
    readonly 18843: "ai_migrate_away_from_inline_tos_enabled"
    readonly 18857: "ctwa_native_ads_creation_web_enabled"
    readonly 18884: "custom_notification_tones"
    readonly 18925: "channels_creation_entrypoint_in_updates_tab_enabled"
    readonly 18967: "new_chat_msg_capping_first_warning_threshold_percentage"
    readonly 18975: "username_check_debounce_in_ms"
    readonly 18984: "channels_question_fetch_responses_page_size"
    readonly 18988: "channels_question_forward_message_types_chat_m1_enabled"
    readonly 19039: "coex_edit_msg_enabled"
    readonly 19053: "channels_reply_forward_message_types_chat_m1_enabled"
    readonly 19059: "utility_order_status_logging_enabled"
    readonly 19110: "wa_web_history_sync_dynamic_throttling"
    readonly 19124: "public_bug_reporting_sidebar"
    readonly 19168: "web_notifications_banner_variant"
    readonly 19191: "prefer_lid_for_chatd_login"
    readonly 19232: "dm_receiver_allowed_values"
    readonly 19276: "payments_br_pix_web_attachment_tray"
    readonly 19285: "coex_revoke_message_enabled"
    readonly 19287: "chatlist_show_draft_for_empty_chat"
    readonly 19303: "newsletter_rcat_field_generating_enabled"
    readonly 19399: "web_notifications_banner_new_logic_enabled"
    readonly 19440: "payment_link_trace_id_logging_enabled"
    readonly 19495: "hybrid_flytrap_feedback_enabled"
    readonly 19518: "desktop_upsell_intro_panel_illustration_variant"
    readonly 19589: "channels_qpl_improvements_supported_types"
    readonly 19590: "ai_rich_response_forwarding_verification_enabled_v1"
    readonly 19624: "voice_ai_conversation_starter_latency_tracking"
    readonly 19676: "ai_web_forward_flow_enabled"
    readonly 19696: "lid_status_non_soaked_client_support_enabled"
    readonly 19763: "ctwa_per_customer_data_sharing_controls_do_not_show_msg_until_chosen"
    readonly 19777: "channels_quiz_sending_enabled"
    readonly 19778: "channels_quiz_receiving_enabled"
    readonly 19811: "group_history_message_count_receiver_upper_limit"
    readonly 19819: "enable_waiting_room_ui"
    readonly 19823: "ai_metabot_document_upload_size_limit_mb"
    readonly 19854: "web_enable_improved_bulk_merge"
    readonly 19860: "view_replies_entry_point"
    readonly 19888: "newsletter_forward_counter_ui_enabled"
    readonly 19889: "newsletter_forward_counter_infra_enabled"
    readonly 19893: "enable_fmx_logging"
    readonly 19894: "enable_rate_app_prompt"
    readonly 19895: "enable_hybrid_video_transcoding"
    readonly 19920: "web_channel_video_server_transcode_upload"
    readonly 19929: "smb_core_biz_profile_ux_refreshed"
    readonly 19985: "ctwa_web_custom_label_signals_enabled"
    readonly 19987: "ai_metabot_document_upload_page_count_limit"
    readonly 19989: "channels_question_response_rate_limit_max_count_in_client_ui"
    readonly 19994: "web_fix_duplicated_lids_history_sync"
    readonly 20041: "ai_ugc_hide_enabled"
    readonly 20043: "web_ip_token_enabled"
    readonly 20064: "wa_web_app_lock_upsell"
    readonly 20070: "enable_hybrid_video_transcoding_for_valid_mp4"
    readonly 20099: "biz_ai_agent_thread_status_history_sync_enabled"
    readonly 20172: "smb_qp_bb_chat_list_banner"
    readonly 20182: "channels_sticker_pack_rendering"
    readonly 20199: "start_chat_context_request_timeout_ms"
    readonly 20220: "ctwa_smb_detected_outcome_lists_enabled"
    readonly 20260: "win_hybrid_force_persistent_storage_permission"
    readonly 20266: "channels_music_receiver_enabled"
    readonly 20354: "admin_only_mention_everyone_group_size"
    readonly 20375: "web_use_kaleidoscope_media_check_enabled"
    readonly 20381: "mm_user_controls_entry_points_update_m1_menu"
    readonly 20388: "mm_user_controls_entry_points_update_m1_icon"
    readonly 20405: "ai_chat_meta_ai_glasses_banner_enabled"
    readonly 20442: "ctwa_native_ads_creation_web_hawk_tool_enabled"
    readonly 20459: "username_max_length"
    readonly 20464: "smba_business_broadcast_genai_custom_user_prompt_enabled"
    readonly 20480: "coex_business_broadcast_enabled"
    readonly 20494: "username_min_length"
    readonly 20520: "enable_video_metrics_fix"
    readonly 20522: "ai_web_meta_ai_image_input_enabled"
    readonly 20545: "pending_group_requests_persistent_banner"
    readonly 20549: "channel_enforcement_logging_enabled"
    readonly 20551: "channels_pinning_nudge_enabled"
    readonly 20555: "wa_webtp_use_thumbnail_renderer"
    readonly 20573: "web_voip_video_renderer"
    readonly 20581: "ai_web_meta_ai_pdf_document_input_enabled"
    readonly 20601: "wa_individual_new_chat_msg_latest_rampup_date"
    readonly 20603: "ai_search_meta_ai_send_button_enabled"
    readonly 20607: "wa_webtp_use_pdf_renderer"
    readonly 20626: "wa_web_clear_selected_chats_enabled"
    readonly 20649: "wa_individual_new_chat_msg_capping_fetch_ttl_seconds"
    readonly 20652: "ai_chat_threads_infra_enabled"
    readonly 20658: "group_history_support_history_sync_receiver_pre_chat"
    readonly 20667: "wa_individual_new_chat_msg_capping_mv_get_subscription_v2"
    readonly 20731: "ctwa_native_ads_creation_web_targeting_modal_hawk_tool_enabled"
    readonly 20747: "ai_rich_response_forward_media_sending_enabled"
    readonly 20798: "profile_scraping_privacy_token_in_about_usync"
    readonly 20815: "favorite_sticker_sync_after_pairing_enabled_web"
    readonly 20817: "view_replies_is_composer_enabled"
    readonly 20833: "biz_ai_tos_variant"
    readonly 20836: "channels_invite_contacts_to_follow_receiver_logging_enabled"
    readonly 20837: "channels_invite_contacts_to_follow_sender_logging_enabled"
    readonly 20849: "enable_3p_contacts_share_hybrid"
    readonly 20892: "hide_auto_quotes_on_web"
    readonly 20899: "enable_windows_jumplist_hybrid"
    readonly 20918: "ai_rewrite_load_more_enabled"
    readonly 20924: "enable_web_group_calling"
    readonly 20929: "smba_business_broadcast_genai_text_model"
    readonly 20946: "smba_business_broadcast_genai_text_max_tries"
    readonly 20970: "wds_web_chip"
    readonly 20993: "username_contact_privacy_setting_allow_uncontact_set_enable"
    readonly 21062: "web_threads_infra_enabled"
    readonly 21073: "dsa_21_channel_reporting_enabled"
    readonly 21139: "ai_rewrite_languages_and_tones_config"
    readonly 21156: "chatlist_prevent_autoread"
    readonly 21184: "enable_sharing_files_from_web_windows_hybrid"
    readonly 21198: "pq_keys_upload"
    readonly 21200: "pq_max_keys_on_server"
    readonly 21201: "pq_batch_upload_size"
    readonly 21235: "paa_support_for_disabled_epehemerality"
    readonly 21259: "ctwa_smb_ae_onboarding_enabled"
    readonly 21261: "group_history_settings"
    readonly 21288: "mm_data_sharing_disclosure_enabled_companion_history_sync"
    readonly 21313: "group_history_messages_time_limit_receiver_enforcement_secs"
    readonly 21350: "web_voip_video_capture_impl"
    readonly 21363: "ai_rich_response_forward_media_receiving_enabled"
    readonly 21410: "wa_individual_new_chat_msg_fci_staleness_ttl_in_seconds"
    readonly 21447: "smba_bb_genai_composer_min_words"
    readonly 21481: "group_history_settings_toggle_ui"
    readonly 21501: "web_status_crossposting_enabled"
    readonly 21508: "smb_business_broadcast_send_web"
    readonly 21510: "ai_continuous_session_transparency_notice_enabled"
    readonly 21535: "enable_tooltip_for_media_hub"
    readonly 21568: "group_history_receiver_floating_banner"
    readonly 21591: "unified_calling_entry_point_desktop_type"
    readonly 21676: "enable_waiting_room_admin_ui"
    readonly 21688: "web_voip_audio_capture_impl"
    readonly 21689: "web_voip_audio_playback_impl"
    readonly 21718: "rt_swapped_fallback_validation"
    readonly 21731: "wavoip_ml_media_automos_model_download_versions"
    readonly 21732: "wavoip_ml_bwe_cong_model_download_versions"
    readonly 21733: "wavoip_ml_bwe_rl_model_download_versions"
    readonly 21734: "wavoip_ml_bwe_tr_model_download_versions"
    readonly 21735: "wavoip_ml_media_vsr_model_download_versions"
    readonly 21736: "wavoip_ml_media_vmos_model_download_versions"
    readonly 21737: "wavoip_ml_media_ns_model_download_versions"
    readonly 21738: "wavoip_ml_bwe_hd_target_model_download_versions"
    readonly 21741: "br_payments_pix_groups_enabled"
    readonly 21742: "wa_web_wae_qpl_enabled"
    readonly 21782: "mm_optimized_delivery_replacing_shimmed_links_enabled"
    readonly 21784: "media_quality_auto_download_settings_enabled"
    readonly 21793: "webview2_enable_offline_support"
    readonly 21799: "functional_chatlist_enabled"
    readonly 21815: "wavoip_ml_temp_model_download_versions"
    readonly 21819: "ctwa_suppress_message_with_external_ad_reply_consumer_db_level_enabled"
    readonly 21821: "wavoip_ml_bwe_gc_undershoot_model_download_versions"
    readonly 21822: "wavoip_ml_bwe_gc_hd_target_model_download_versions"
    readonly 21890: "username_lid_migration_calling"
    readonly 21909: "wa_web_enable_granular_notifications"
    readonly 21917: "wa_web_disable_prefetch_loadables"
    readonly 21918: "defense_mode_quarantine_message_expiration_window"
    readonly 21921: "defense_mode_quarantine_bulk_unblock_limit"
    readonly 21984: "username_suggestions_enabled"
    readonly 22006: "enable_agm_flow_cta"
    readonly 22024: "ai_reply_message_context_max_count"
    readonly 22025: "ai_reply_message_context_trigger_min_count"
    readonly 22038: "ai_chat_thread_capability_enabled"
    readonly 22067: "ctwa_smb_ae_onboarding_compatability_code"
    readonly 22070: "ai_chat_threads_historical_messages_migration_enabled"
    readonly 22086: "wa_web_lists_m2_enabled"
    readonly 22089: "channels_music_forwarding_disabled"
    readonly 22090: "wa_web_lists_m1_enabled"
    readonly 22155: "web_cache_open_failed_reload_flow_enabled"
    readonly 22165: "ai_groups_open_enabled"
    readonly 22171: "ai_group_participation_enabled"
    readonly 22184: "ai_group_participation_send_enabled"
    readonly 22186: "web_calling_perf_optimizations_bitmask"
    readonly 22196: "channels_invite_link_preview_improvement_enabled"
    readonly 22203: "newsletter_forward_counter_bump_own_channel_updates_fowards"
    readonly 22204: "newsletter_forward_counter_bump_forwards_to_self"
    readonly 22205: "newsletter_forward_counter_bump_second_order_forwards"
    readonly 22206: "newsletter_forward_counter_max_send_after_random_time"
    readonly 22221: "is_spoiler_rich_format_enabled"
    readonly 22230: "group_history_settings_query"
    readonly 22236: "ai_group_participation_add_tee_enabled"
    readonly 22249: "br_payments_home_duration_rule_for_pux_banner"
    readonly 22280: "channels_invite_contacts_to_follow_receiver_invalid_message_drop_endabled"
    readonly 22298: "ai_pdfn_nux_ai_group_notice_id"
    readonly 22301: "ai_metabot_document_ocr_image_conversion_enabled"
    readonly 22311: "enable_futureproof_galaxy_flow_message_for_business_numbers"
    readonly 22316: "channels_admin_profiles_sender_enabled"
    readonly 22318: "channels_admin_profiles_receiver_enabled"
    readonly 22329: "group_history_reporting"
    readonly 22361: "in_app_bug_reporting_description_good_quality_chars"
    readonly 22363: "in_app_bug_reporting_show_quality_hints_v1"
    readonly 22384: "smba_business_broadcast_genai_master_abprop"
    readonly 22434: "utility_payment_reminder_m1_enabled"
    readonly 22488: "ai_contextual_writing_help_enabled"
    readonly 22515: "dsa_26_receiver_enabled"
    readonly 22516: "dsa_26_sender_enabled"
    readonly 22518: "media_hub_history_max_days"
    readonly 22525: "vid_port_frm_buf_mutex_fixes"
    readonly 22561: "smb_core_biz_profile_ux_refreshed_v2"
    readonly 22567: "wa_web_show_status_ring_for_no_unread"
    readonly 22603: "web_phone_number_global_search"
    readonly 22616: "win_hybrid_voip_anr_optimizations"
    readonly 22654: "member_name_tag_web_sender_enabled"
    readonly 22655: "member_name_tag_web_receiver_enabled"
    readonly 22672: "ai_rich_response_post_citations_enabled"
    readonly 22692: "settings_sync_enabled"
    readonly 22750: "ai_rich_response_zeitgeist_carousel_enabled"
    readonly 22759: "ai_contextual_writing_help_num_suggestions"
    readonly 22773: "ai_pdfn_nux_ai_group_tee_notice_id"
    readonly 22776: "mm_optimized_delivery_app_cta_enabled"
    readonly 22784: "wa_media_image_upload_cache"
    readonly 22785: "utility_payment_reminder_m1_logging_enabled"
    readonly 22795: "ai_imagine_loading_indicator_enabled"
    readonly 22797: "ai_contextual_writing_help_languages_and_tones_config"
    readonly 22813: "wa_web_share_content_uj"
    readonly 22815: "message_keys_async_chunk_size"
    readonly 22825: "synced_message_keys_processing_type"
    readonly 22930: "web_anr_file_size_threshold_to_use_worker_mb"
    readonly 22931: "web_anr_media_chunk_enc_delay_enabled"
    readonly 22962: "empty_unread_filter_cta_variant"
    readonly 23018: "waweb_chatinfo_refresh"
    readonly 23042: "br_smb_paymentshome_enabled"
    readonly 23045: "web_voip_load_wasm_variant"
    readonly 23073: "webview2_disable_gpu_acceleration_memory_threshold_mb"
    readonly 23168: "channels_admin_profiles_update_enabled"
    readonly 23169: "ai_chat_threads_web_enabled"
    readonly 23170: "channels_admin_profiles_forwarding_to_chats_enabled"
    readonly 23174: "channels_admin_profiles_list_enabled"
    readonly 23188: "ai_session_transparency_meta_ai_enabled"
    readonly 23200: "web_anr_async_media_decryption_enabled"
    readonly 23270: "aura_enabled"
    readonly 23273: "aura_app_themes_benefit_active"
    readonly 23274: "aura_app_themes_enabled"
    readonly 23277: "aura_pinned_chats_enabled"
    readonly 23278: "aura_pinned_chats_benefit_active"
    readonly 23322: "imp_send_signal_post_connect_webc_enabled"
    readonly 23323: "imp_send_signal_post_connect_delay"
    readonly 23328: "saga_message_feedback_using_canonical_ent"
    readonly 23347: "ai_unified_response_sender_web_enabled"
    readonly 23348: "ai_unified_response_receiver_web_enabled"
    readonly 23463: "mex_get_privacy_settings_mode"
    readonly 23464: "coex_calling_permissions_3p_enabled"
    readonly 23486: "wds_web_toast"
    readonly 23498: "wa_webtp_use_pdf_editor"
    readonly 23530: "web_ai_group_open_support"
    readonly 23559: "booking_confirmation_enabled_wa_web"
    readonly 23595: "web_hybrid_apply_latest_db_schema_optimization_enabled"
    readonly 23616: "channel_views_vpv_definition_enabled"
    readonly 23677: "ctwa_smb_ae_onboarding_nux_auto_trigger_on_list_home"
    readonly 23692: "aigc_version"
    readonly 23695: "web_chatpsa_forwarding"
    readonly 23709: "utility_appointment_logging_enabled"
    readonly 23725: "ai_web_ask_meta_ai_enabled"
    readonly 23745: "channel_enforcement_policy_education_enabled"
    readonly 23789: "web_voip_dynamic_thread_preallocate_count"
    readonly 23795: "username_channels_pn_privacy_enabled"
    readonly 23796: "top_level_message_secret_check"
    readonly 23809: "channels_album_receiver_enabled"
    readonly 23817: "username_enabled_on_companion"
    readonly 23819: "ai_rich_response_inline_links_enabled"
    readonly 23836: "disable_libaom_registration"
    readonly 23845: "scheduled_messages_sender_enabled"
    readonly 23857: "smbi_premium_broadcast_max_recipient_limit"
    readonly 23859: "channels_album_sender_enabled"
    readonly 23874: "mex_get_privacy_contact_list_enabled"
    readonly 23880: "biz_ai_consumer_tos_update_web"
    readonly 23885: "ai_mode_selector_enabled"
    readonly 23933: "coex_calling_enabled_business"
    readonly 23953: "pix_onboarding_new_content_enabled"
    readonly 23978: "bug_reporting_async_attachments_enabled"
    readonly 23994: "channel_status_creation"
    readonly 23995: "channel_status_consumption"
    readonly 24004: "channels_questions_search_enabled"
    readonly 24024: "group_from_group"
    readonly 24047: "aura_ringtones_enabled"
    readonly 24050: "aura_ringtones_benefit_active"
    readonly 24061: "ctwa_3pd_post_dc_depth_limit"
    readonly 24109: "ai_unified_response_imagine_receiver_web_enabled"
    readonly 24110: "wa_status_chain_new_at_end"
    readonly 24114: "biz_ai_agent_3p_store_links_enabled"
    readonly 24133: "lists_chat_list_row_pill_enabled"
    readonly 24147: "web_history_sync_worker_enabled"
    readonly 24160: "pq_1on1_message_enabled"
    readonly 24161: "bug_reporting_using_graphql"
    readonly 24173: "wavoip_ml_transport_download_versions"
    readonly 24174: "wavoip_ml_nadl_model_download_versions"
    readonly 24184: "peer_message_lid_migration_outgoing"
    readonly 24210: "is_spoiler_rich_format_sender_enabled"
    readonly 24215: "flows_wa_web_agm_cta"
    readonly 24216: "flows_wa_web_responses_download"
    readonly 24244: "enable_mention_everyone_syncd_sender"
    readonly 24268: "hide_silent_system_message_enabled"
    readonly 24280: "web_display_lid_contacts"
    readonly 24311: "smb_label_sync_critical_event_logging"
    readonly 24343: "web_force_lid_chats_in_history"
    readonly 24347: "channels_admin_profiles_settings_enabled"
    readonly 24361: "ai_group_send_mentioned_pushname_enabled"
    readonly 24363: "web_log_capacity_override"
    readonly 24388: "br_smb_pix_payment_request_variant"
    readonly 24405: "poll_end_time_enabled"
    readonly 24421: "bug_reporting_rid_in_flytrap"
    readonly 24422: "bug_reporting_pre_uploaded_attachments_on_bug_creation_enabled"
    readonly 24425: "wa_web_horizontal_link_previews"
    readonly 24429: "wa_web_enable_follow_up_reply_icon"
    readonly 24432: "wa_web_anyone_can_link_m2"
    readonly 24477: "group_username_updates_as_member_updates_enabled"
    readonly 24484: "ai_unified_response_qpl_logging"
    readonly 24488: "channels_albums_v2_forwarding_to_status_enabled"
    readonly 24489: "is_ai_mode_selector_visible"
    readonly 24495: "wa_consumer_nova_entry_point_settings_enabled"
    readonly 24500: "wa_status_chain_unseen_min_pog"
    readonly 24504: "enable_web_calling_nux"
    readonly 24517: "poll_add_option_enabled"
    readonly 24518: "poll_hide_voters_enabled"
    readonly 24526: "wa_web_reduce_forced_layout_chat_open"
    readonly 24541: "wa_web_channels_comet_video_player_enabled_v2"
    readonly 24584: "group_member_updates_hide_in_thread_enabled"
    readonly 24585: "group_member_updates_usernames_ui_enabled"
    readonly 24586: "group_member_updates_usernames_db_enabled"
    readonly 24599: "calling_av_sync_webrtc"
    readonly 24610: "scheduled_messages_receiver_enabled"
    readonly 24617: "group_member_updates_usernames_enabled"
    readonly 24652: "ai_group_call_version"
    readonly 24654: "ai_group_call_add_in_call_ahgc_enabled"
    readonly 24655: "ai_group_call_max_version_by_platform"
    readonly 24656: "ai_group_call_max_version_by_country"
    readonly 24662: "payment_links_trust_signals_other_metatag_kill_switch_enabled"
    readonly 24741: "rt_ghs_sender_enabled"
    readonly 24742: "rt_ghs_receiver_enabled"
    readonly 24754: "biz_ai_consumer_tos_notice_iq_web"
    readonly 24773: "wa_web_contact_search_tokenized_enabled"
    readonly 24783: "enable_windows_xdr_chat_handoff"
    readonly 24791: "wa_web_status_comet_video_player_enabled"
    readonly 24800: "aura_stickers_enabled"
    readonly 24801: "aura_stickers_benefit_active"
    readonly 24812: "enable_web_calling_beta_upsell"
    readonly 24838: "web_request_missing_keys_for_removes"
    readonly 24843: "enable_mention_everyone_receiver_web"
    readonly 24844: "enable_mention_everyone_sender_web"
    readonly 24850: "bug_reporting_abprops_uploaded_on_submissoin"
    readonly 24852: "enhanced_mention_suggestions_non_group_members_enabled"
    readonly 24853: "cci_compliance_mm"
    readonly 24882: "windows_contacts_sync_interval"
    readonly 24883: "windows_contacts_initial_sync_delay"
    readonly 24884: "poll_end_time_receiving_enabled"
    readonly 24885: "poll_hide_voters_receiving_enabled"
    readonly 24886: "poll_creator_edit_receiving_version"
    readonly 24887: "poll_creator_edit_enabled"
    readonly 24905: "wa_web_video_comet_video_player_enabled"
    readonly 24915: "wa_nct_token_salt_creation_enabled"
    readonly 24924: "web_worker_adv_processing_enabled"
    readonly 24941: "wa_nct_token_send_enabled"
    readonly 24944: "wa_web_me_tab"
    readonly 24945: "wa_web_self_profile_photo_fix_enabled"
    readonly 24955: "wa_consumer_nova_settings_green_dot_enabled"
    readonly 24959: "defense_mode_quarantine"
    readonly 24983: "cci_compliance_ctwa"
    readonly 24984: "ctwa_3pd_opt_out_counter_optimization_enabled"
    readonly 24991: "enable_waiting_room_logging"
    readonly 25006: "wa_web_reduce_cascading_updates_chat_open"
    readonly 25009: "wa_web_anyone_can_link_m2_flood_limit"
    readonly 25015: "wa_web_status_first_upload_fix_enabled"
    readonly 25021: "mm_disclosure_learn_more_article_id"
    readonly 25034: "status_infra_1_1_session_split"
    readonly 25059: "username_contacts_ui_refresh"
    readonly 25065: "wa_web_comet_video_player_snapl"
    readonly 25071: "im_bloks_widget_enable"
    readonly 25078: "channels_t_enabled"
    readonly 25079: "wa_web_enable_status_hq_thumbnail"
    readonly 25090: "ai_file_upload_supported_file_types"
    readonly 25093: "ai_file_upload_count_limit"
    readonly 25119: "ai_bot_integration_enabled"
    readonly 25144: "wds_web_expressions_panel"
    readonly 25149: "enable_logging_qbm_incoming_message"
    readonly 25151: "wa_web_status_viewer_side_poster_identifiers_enabled"
    readonly 25177: "enable_web_voip_platform_av_sync"
    readonly 25180: "ctwa_smb_label_chat_header_enabled_web"
    readonly 25189: "wa_nct_token_history_sync_enabled"
    readonly 25206: "smb_business_broadcast_multi_audience_send_web"
    readonly 25210: "aura_stickers_overlay_animation_enabled"
    readonly 25253: "wa_nct_token_syncd_enabled"
    readonly 25255: "acp_removal"
    readonly 25268: "ai_bot_integration_bot_profile"
    readonly 25269: "ai_bot_integration_history_sync_enabled"
    readonly 25287: "ai_dynamic_mode_selector_enabled"
    readonly 25292: "wa_web_group_info_notification_row"
    readonly 25303: "may_have_messages_enabled"
    readonly 25306: "wa_web_wam_falco_mode"
    readonly 25309: "wa_web_wam_falco_shadow_event_ids"
    readonly 25310: "wa_web_search_empty_state_m1"
    readonly 25329: "wa_web_ur_imagine_video_enabled"
    readonly 25331: "wa_web_imagine_ur_enabled"
    readonly 25332: "wa_web_ur_bloks_enabled"
    readonly 25351: "wds_web_submenus"
    readonly 25353: "username_exposed_logging_enabled"
    readonly 25366: "cci_compliance_ctwa_learn_more_hyperlink"
    readonly 25388: "wa_consumer_nova_eligibility_subscription_status_check_enabled"
    readonly 25408: "wa_web_highlight_me_mention"
    readonly 25413: "web_anr_batch_and_queue_bulk_contacts_db_writes_enabled"
    readonly 25414: "web_group_experimentation_enable"
    readonly 25421: "mm_data_sharing_disclosure_enabled_additional_transparency_large_screens"
    readonly 25455: "wa_web_default_profile_pics"
    readonly 25465: "biz_vpv_impression_logging_enabled"
    readonly 25469: "ai_bot_integration_history_sync_pre_chatd_enabled"
    readonly 25517: "ai_chat_threads_pin_enabled"
    readonly 25520: "ai_chat_threads_pin_max_count"
    readonly 25523: "ai_video_upload_size_limit_mb"
    readonly 25524: "ai_file_upload_size_limit_mb"
    readonly 25599: "br_payments_payment_request_cta"
    readonly 25609: "wa_web_chat_search_entrypoint"
    readonly 25621: "enable_web_voip_p2p"
    readonly 25639: "sticker_store_testing_enabled"
    readonly 25641: "web_media_compute_in_worker_enabled"
    readonly 25648: "after_read_sending_enabled"
    readonly 25649: "after_read_receiver_enabled"
    readonly 25660: "wa_web_base_video_comet_video_player_enabled"
    readonly 25758: "poll_add_option_receiving_enabled"
    readonly 25789: "username_key_upsell_max_numbers"
    readonly 25790: "username_key_upsell_max_characters"
    readonly 25797: "ai_dynamic_mode_selector_ttl_seconds"
    readonly 25804: "hsm_tag_in_history_sync_deserialization_enabled"
    readonly 25805: "wa_web_lists_full_width_filters"
    readonly 25808: "wa_web_groups_in_common_multi_contact"
    readonly 25811: "web_date_marker_calendar_enabled"
    readonly 25818: "channel_us_ncii_reporting_enabled"
    readonly 25820: "wa_web_copy_link_url_enabled"
    readonly 25823: "web_calendar_message_density_enabled"
    readonly 25836: "wa_web_highlight_me_mention_groupsize_threshold"
    readonly 25846: "wa_web_biz_profile_graphql_migration"
    readonly 25910: "group_history_bundle_time_limit_receiver_enforcement_secs"
    readonly 25915: "web_anr_noop_gc_enabled"
    readonly 25927: "ai_subscription_enabled"
    readonly 25929: "ai_unified_response_receiver_web_enabled_v2"
    readonly 25930: "ai_unified_response_receiver_web_timestamp_v2"
    readonly 25937: "wa_web_preload_conversation_chat_open"
    readonly 25951: "enhanced_mention_limit"
    readonly 26001: "support_contact_form_using_graphql"
    readonly 26012: "enable_web_voip_proxy_and_sctp_workers"
    readonly 26027: "transcode_and_repair_videos"
    readonly 26033: "br_pix_key_bubble_content_update"
    readonly 26037: "group_history_out_of_window_pin_sender"
    readonly 26039: "group_history_out_of_window_pins_receiver"
    readonly 26062: "tappable_links_in_poll_option_enabled"
    readonly 26079: "enable_webcodec_video_encode"
    readonly 26086: "aura_subscription_simulation_enabled"
    readonly 26102: "wa_web_reactions_motion_v2_enabled"
    readonly 26114: "improve_group_reporting"
    readonly 26120: "channels_follower_invite_creation_modal_enabled"
    readonly 26133: "web_worker_prekey_processing_enabled"
    readonly 26138: "waweb_crossposting_attributions"
    readonly 26148: "channels_forward_counter_on_status_card_enabled"
    readonly 26165: "smb_web_customer_management_enabled"
    readonly 26171: "ai_pdfn_nux_ai_group_tee_discover_notice_id"
    readonly 26182: "gc_device_switching_killswitch"
    readonly 26189: "ai_hatch_integration_enabled"
    readonly 26190: "ai_hatch_integration_bot_profile"
    readonly 26191: "is_individual_suspicious_fmx_enabled"
    readonly 26201: "wa_web_export_chat"
    readonly 26207: "suggested_audiences_wa_web"
    readonly 26211: "web_pnless_stanzas"
    readonly 26218: "dm_receiver_after_read_allow_values"
    readonly 26220: "username_key_upsell_mode"
    readonly 26225: "after_read_fallback_duration"
    readonly 26234: "wa_asteria_enabled"
    readonly 26276: "group_suspension_appeals_redesign_enabled"
    readonly 26279: "wa_webtp_edit_pdf_in_whatsapp_enabled"
    readonly 26280: "mm_1pd_post_dc_new_schema_enabled"
    readonly 26281: "mm_1pd_post_dc_depth_limit"
    readonly 26282: "mm_1pd_post_dc_old_schema_disabled"
    readonly 26296: "web_crosspost_settings_sync"
    readonly 26302: "ctwa_block_ib_ar_for_wabai"
    readonly 26307: "bug_reporting_attach_view_dump_pre_bug_creation"
    readonly 26311: "bug_reporting_attach_pathfinder_pre_bug_creation"
    readonly 26346: "aura_status_search_enabled"
    readonly 26347: "scheduled_messages_window_duration_max_seconds"
    readonly 26348: "scheduled_messages_window_duration_min_seconds"
    readonly 26390: "inapp_signup_confirmation_message_enabled"
    readonly 26392: "channels_photo_polls_genai_enabled"
    readonly 26399: "wa_asteria_eligibility_subscription_status_check_enabled"
    readonly 26414: "native_lib_sandboxing_enable_libwebp"
    readonly 26426: "business_broadcast_campaign_syncd_enabled"
    readonly 26435: "enable_offer_v2_upgrade"
    readonly 26445: "ai_hatch_integration_history_sync_pre_chatd_enabled"
    readonly 26451: "group_history_send_after_join"
    readonly 26465: "stickers_emoji_tagging_enabled"
    readonly 26467: "wa_web_agm_signup_enabled"
    readonly 26470: "web_status_likes_send_v2_enabled"
    readonly 26481: "wa_web_feature_parity_small_wins"
    readonly 26492: "auth_agents_consumer_exp_enabled"
    readonly 26517: "ai_hatch_integration_history_sync_enabled"
    readonly 26545: "aura_status_search_max_viewers"
    readonly 26546: "aura_status_search_timeout_threshold"
    readonly 26548: "is_expand_fmx_account_age_ui_enabled"
    readonly 26549: "is_expand_fmx_account_age_bolded_non_auto_expose"
    readonly 26550: "is_expand_fmx_mex_enabled"
    readonly 26551: "is_expand_fmx_enabled_non_auto_expose"
    readonly 26553: "wa_web_pre_chat_device_id_test"
    readonly 26555: "wa_web_download_mimetype_check_block_enabled"
    readonly 26602: "aura_stickers_preview_max_animation_count"
    readonly 26610: "wa_web_show_hd_photo"
    readonly 26614: "ai_bizai_2way_integration_history_sync_pre_chatd_enabled"
    readonly 26618: "events_v2_invitation_message_version"
    readonly 26629: "wa_web_chat_themes"
    readonly 26659: "waweb_status_close_friends_viewer_side_enabled"
    readonly 26670: "biz_ai_responding_list_enabled"
    readonly 26719: "ctwa_smb_multiselect_enabled"
    readonly 26731: "wa_web_contact_and_chat_fuzzy_search_distance_threshold"
    readonly 26733: "wa_web_contact_and_chat_fuzzy_search_timeout_threshold"
    readonly 26744: "voip_enable_webrtc_stats_polling"
    readonly 26745: "ai_learning_clear_chat_disable_empty_chats"
    readonly 26772: "parse_encrypted_dsm_msg_fix"
    readonly 26773: "wds_web_composer_toolbar_v2"
    readonly 26774: "channel_status_consumption_music_enabled"
    readonly 26784: "mm_signal_sharing_verification_new_signal_type_origin"
    readonly 26817: "enable_web_voip_virtual_video_capture_driver"
    readonly 26820: "privacy_screen_enabled"
    readonly 26829: "feature_key_store_infra_enabled"
    readonly 26847: "payments_br_p2p_pix_copy_key_buyer_logging"
    readonly 26876: "calling_rust_migration_incoming_stanza_bitmap"
    readonly 26888: "remove_pn_dependencies"
    readonly 26892: "web_add_contact"
    readonly 26910: "channels_question_admin_m2_enabled"
    readonly 26911: "channels_question_follower_m2_enabled"
    readonly 26924: "channels_reply_forward_message_types_status_m2_enabled"
    readonly 26925: "channels_question_forward_message_types_chat_m2_enabled"
    readonly 26926: "channels_question_forward_message_types_status_m2_enabled"
    readonly 26927: "channels_reply_forward_message_types_chat_m2_enabled"
    readonly 26930: "channels_question_sender_message_types_m2_enabled"
    readonly 26931: "channels_question_reply_sender_message_types_m2_enabled"
    readonly 26932: "channels_question_receiver_message_types_m2_enabled"
    readonly 26933: "channels_question_reply_receiver_message_types_m2_enabled"
    readonly 26947: "wavoip_enable_ml_namespace_v2"
    readonly 26966: "ks_use_component_model"
    readonly 26974: "enable_wds_calling_dropdown"
    readonly 26996: "wa_asteria_rollout_enabled"
    readonly 27008: "payments_br_p2m_order_details_buyer_logging"
    readonly 27011: "status_chain_from_my_interaction_limit"
    readonly 27026: "payments_br_p2m_pix_copy_key_buyer_logging"
    readonly 27027: "payments_br_payment_links_buyer_logging"
    readonly 27028: "payments_br_p2m_pix_copy_code_buyer_logging"
    readonly 27054: "status_likes_fifa_lottie_full_screen_animation_enabled"
    readonly 27068: "wa_consumer_nova_subscription_notifications_enabled"
    readonly 27069: "wa_web_enable_syncd_key_persistence_only_after_server_ack"
    readonly 27082: "business_broadcast_insights_sync_past_x_days"
    readonly 27083: "ai_maiba_wass_migration_receiving"
    readonly 27084: "ai_maiba_wass_migration_sending"
    readonly 27092: "payments_br_p2m_pay_now_buyer_logging"
    readonly 27093: "payments_br_p2m_view_order_buyer_logging"
    readonly 27094: "payments_br_p2m_pix_more_ways_to_pay_buyer_logging"
    readonly 27095: "payments_br_p2m_completed_payment_intent_buyer_logging"
    readonly 27096: "payments_br_p2m_copy_boleto_code_buyer_logging"
    readonly 27109: "wavoip_ml_bwe_quickhd_model_download_versions"
    readonly 27114: "payments_br_p2p_pix_copy_code_buyer_logging"
    readonly 27115: "smb_qp_emergency_force_fetch_nonce"
    readonly 27118: "wa_asteria_meta_ai_settings_tab_entrypoint_enabled"
    readonly 27124: "md_syncd_mutation_logging"
    readonly 27125: "md_syncd_mutation_summary_logging"
    readonly 27126: "md_syncd_bundle_logging"
    readonly 27135: "aura_pinned_chats_targeted_nux_force"
    readonly 27148: "wa_webtp_thumbnail_renderer_timeout_ms"
    readonly 27157: "wa_web_forward_to_small_groups"
    readonly 27172: "wa_payments_smb_labels_convention_enabled"
    readonly 27173: "wa_payments_smb_enabled"
    readonly 27177: "disable_raise_hand_1on1"
    readonly 27210: "aura_settings_row_enabled"
    readonly 27217: "non_wa_contact_invite_cta_enabled"
    readonly 27218: "business_broadcast_insights_campaign_ttl_days"
    readonly 27219: "acs_use_graphql_issuance"
    readonly 27237: "wmi_worker_scheduler_web"
    readonly 27239: "waweb_enable_legacy_image_zoom"
    readonly 27240: "channels_status_consumption_entrypoints"
    readonly 27249: "web_anr_async_msg_send_handler"
    readonly 27264: "wds_web_rich_text_field"
    readonly 27268: "enable_web_voip_anr_optimizations"
    readonly 27278: "opus_enabled"
    readonly 27309: "br_payments_payment_detection_enhancement"
    readonly 27343: "status_chain_from_cl_mode"
    readonly 27355: "ai_rich_response_unknown_sender_preview_enabled"
    readonly 27356: "ai_hatch_integration_tab_enabled"
    readonly 27359: "username_1on1_sys_msg_creation_upsell_enabled"
    readonly 27441: "wa_web_composer_height_increase_enabled"
    readonly 27444: "give_dogfooders_task_id_for_bug_reporting"
    readonly 27449: "channels_context_card_invite_followers_enabled"
    readonly 27470: "ai_hatch_video_upload_enabled"
    readonly 27483: "call_info_optimizations_version"
    readonly 27486: "smb_business_broadcast_send_web_smba"
    readonly 27512: "wa_web_hq_image_thumbnail_in_chat_scans"
    readonly 27515: "ctwa_ae_model_meta_data_enabled"
    readonly 27516: "ctwa_ae_model_meta_data_signal_enabled"
    readonly 27519: "ai_chat_threads_implicit_routing_strategy"
    readonly 27568: "smb_core_rec_card"
    readonly 27585: "smb_auth_agents_feature_control_enabled"
    readonly 27591: "enable_webrtc_video_jb"
    readonly 27614: "wa_web_important_msg_notification"
    readonly 27616: "wa_web_edit_before_forwarding_to_status"
    readonly 27620: "status_e2ee_send_over_status_stanza"
    readonly 27622: "status_e2ee_recv_over_status_stanza"
    readonly 27628: "web_pathfinder_logging"
    readonly 27635: "ai_rich_response_unknown_sender_verification_masking_enabled"
    readonly 27640: "ctwa_3pd_aggregated_conversion_enabled"
    readonly 27642: "enable_copy_paste_p2p"
    readonly 27643: "enable_order_details_for_payment_key"
    readonly 27660: "ai_hatch_commands_enabled"
    readonly 27677: "web_drawer_descriptor_enabled"
    readonly 27695: "web_voip_sctp_worker_safari_exp"
    readonly 27714: "wa_web_enable_mention_message"
    readonly 27750: "animated_soccer_ball_test_enabled"
    readonly 27751: "animated_soccer_ball_prod_enabled"
    readonly 27768: "wa_web_loader_button_uix_improvement"
    readonly 27775: "web_anr_async_contacts_restore_from_db_enabled"
    readonly 27777: "channel_status_fill_gap_page_size"
    readonly 27782: "wa_web_media_upload_retry_retries_count"
    readonly 27803: "opus_t"
    readonly 27807: "use_custom_soccer_ball_for_reaction_enabled"
    readonly 27817: "ai_chat_meta_ai_home_web_enabled"
    readonly 27819: "lightweight_group_creation"
    readonly 27833: "soccer_reaction_in_tray_enabled"
    readonly 27834: "soccer_ball_reaction_full_animation_enabled"
    readonly 27839: "coexv2_send_enabled"
    readonly 27841: "voice_call_string_test"
    readonly 27854: "web_biz_quality_telemetry_message_clicks_enabled"
    readonly 27855: "web_biz_quality_telemetry_enabled"
    readonly 27860: "inapp_signup_agm_cta_experiment"
    readonly 27862: "timeout_mex_call_expand_fmx_trust_signals"
    readonly 27873: "ai_hatch_document_upload_size_limit_mb"
    readonly 27876: "ai_hatch_forwarding_html_enabled"
    readonly 27897: "ai_hatch_media_upload_count_limit"
    readonly 27916: "wavoip_ml_bwe_undershoot_model_download_versions_v2"
    readonly 27939: "wa_web_jump_to_cart"
    readonly 27941: "wa_webtp_pdf_renderer_mode_no_exposure"
    readonly 27942: "giphy_pma_shutoff_enabled"
    readonly 27946: "aura_premium_stickers_killswitch"
    readonly 27947: "wa_web_chatlist_render_chat_open"
    readonly 27954: "wds_web_profile_photo"
    readonly 27958: "web_show_to_hide_enabled"
    readonly 27959: "p2p_pills_enabled"
    readonly 27975: "backfill_supports_coex_companion"
    readonly 27979: "hosted_message_flag_enabled"
    readonly 27990: "wavoip_ml_bwe_hd_target_model_download_versions_v2"
    readonly 27991: "wavoip_ml_bwe_cong_model_download_versions_v2"
    readonly 27992: "wavoip_ml_media_ns_model_download_versions_v2"
    readonly 27993: "wavoip_ml_media_vmos_model_download_versions_v2"
    readonly 27994: "wavoip_ml_bwe_rl_model_download_versions_v2"
    readonly 27995: "wavoip_ml_media_vsr_model_download_versions_v2"
    readonly 27996: "wavoip_ml_bwe_tr_model_download_versions_v2"
    readonly 27997: "wavoip_ml_media_automos_model_download_versions_v2"
    readonly 27998: "wavoip_ml_bwe_plc_model_download_versions_v2"
    readonly 27999: "smbw_business_broadcast_smart_column_detection_enabled"
    readonly 28012: "wavoip_ml_bwe_quickhd_model_download_versions_v2"
    readonly 28013: "wavoip_ml_uvq_download_versions_v2"
    readonly 28014: "wavoip_ml_temp_model_download_versions_v2"
    readonly 28015: "wavoip_ml_nadl_model_download_versions_v2"
    readonly 28019: "wavoip_ml_bwe_gc_undershoot_model_download_versions_v2"
    readonly 28020: "wavoip_ml_transport_download_versions_v2"
    readonly 28021: "wavoip_ml_bwe_gc_hd_target_model_download_versions_v2"
    readonly 28033: "ai_chat_meta_ai_home_default_landing_enabled"
    readonly 28041: "web_voip_video_low_cap_width"
    readonly 28042: "web_voip_video_low_cap_height"
    readonly 28043: "web_voip_video_mid_cap_width"
    readonly 28044: "web_voip_video_mid_cap_height"
    readonly 28046: "web_calling_auto_popout_video"
    readonly 28054: "wa_web_falco_console_logger"
    readonly 28070: "blocklist_system_msg_on_full_refetch"
    readonly 28087: "group_member_updates_username_description_enabled"
    readonly 28089: "enhanced_mention_suggestions_min_mention_char_count"
    readonly 28099: "m2_audience_dynamic_rules"
    readonly 28110: "coexv2_recv_enabled"
    readonly 28129: "consumer_graphql_enable_double_log_for_survey"
    readonly 28138: "smb_business_broadcast_send_web_no_exp"
    readonly 28139: "smb_business_broadcast_send_web_smba_no_exp"
    readonly 28142: "inapp_signup_m1_logging_enabled"
    readonly 28144: "syncd_use_index_for_lthash_lookup"
    readonly 28148: "channels_visibility_logging_fullscreen_media_enabled"
    readonly 28158: "fetch_qp_via_graphql_web_enabled"
    readonly 28159: "consumer_graphql_web_to_fetch_qp_surface_ids"
    readonly 28170: "out_contact_invites_enabled"
    readonly 28203: "web_voip_low_resource_device"
    readonly 28226: "enable_web_log_download"
    readonly 28268: "ai_genai_straw_hat"
    readonly 28277: "business_broadcasts_syncd_wam_logging"
    readonly 28278: "ai_group_tee_history_share_enabled"
    readonly 28336: "ai_video_upload_support_languages"
    readonly 28340: "cross_device_message_editing"
    readonly 28345: "aura_kill_switch"
    readonly 28349: "coex_iicon_backfill"
    readonly 28376: "group_suspension_appeals_redesign_variant_enable"
    readonly 28399: "canonical_ent_companion_server_cached_nonce_enabled"
    readonly 28434: "calling_rust_migration_incoming_ack_stanza_bitmap"
    readonly 28455: "wa_web_mention_search"
    readonly 28470: "smb_biz_ai_lists_pills"
    readonly 28471: "wa_web_biz_broadcasts_catalog_attachment"
    readonly 28473: "mm_tap_target_bloks_client_hydration_enabled"
    readonly 28479: "channel_status_forwarding_enabled"
    readonly 28500: "channel_status_deeplink_enabled"
    readonly 28506: "wa_web_push_name_in_global_search_non_contacts_enabled"
    readonly 28516: "relax_integrity_constraints_for_bb_wa_tenured_accounts"
    readonly 28519: "smb_web_category_search_via_graph_enabled"
    readonly 28529: "consumer_web_qp_graphql_to_fetch_qp_frequency_mins"
    readonly 28552: "biz_ai_tools_settings"
    readonly 28557: "wds_web_dialog"
    readonly 28558: "mm_optimized_delivery_archive_signal_sharing_enabled"
    readonly 28572: "mm_disclosure_handle_tos_failures_enabled"
    readonly 28573: "web_biz_simple_signal_enabled"
    readonly 28574: "web_biz_quality_telemetry_message_reads_enabled"
    readonly 28584: "ai_gizmo_integration_enabled"
    readonly 28585: "ai_subscription_imagine_intent_enabled"
    readonly 28590: "web_biz_quality_telemetry_message_level_actions_enabled"
    readonly 28611: "wa_meta_one_enabled"
    readonly 28612: "wa_meta_one_rollout_enabled"
    readonly 28613: "wa_meta_one_eligibility_subscription_status_check_enabled"
    readonly 28621: "wa_web_quick_reactions"
    readonly 28664: "pnh_history_sync_force_general"
    readonly 28678: "username_api_rate_limit_enabled"
    readonly 28689: "enable_setup_error_result_check"
    readonly 28787: "group_history_after_join_prerequisites"
    readonly 28806: "inapp_signup_qpl_logging_enabled"
    readonly 28812: "wa_web_status_resharer_flow_enabled"
    readonly 28890: "web_anr_throttle_signal_snapshot_enabled"
    readonly 28891: "im_nfm_multi_step_form_killswitch"
    readonly 28897: "wa_web_bot_tos_check_refiniement"
    readonly 28909: "wa_web_voip_adaptive_grid_page_size"
    readonly 28941: "web_bot_profile_gql_migration_enabled"
    readonly 28962: "web_contact_sort_letters_first"
    readonly 29002: "mm_optimized_delivery_token_fallback_disabled"
    readonly 29007: "wa_smb_biz_profile_google_integration_enabled"
    readonly 29021: "smbw_business_broadcast_duplicate_enabled"
    readonly 29026: "username_key_redesign_enabled"
    readonly 29033: "smb_business_broadcast_pro_enabled"
    readonly 29037: "mm_optimized_delivery_unique_token_per_message_id_enabled"
    readonly 29060: "web_anr_prune_cmc"
    readonly 29063: "web_frequently_contacted_enabled"
    readonly 29122: "web_anr_batch_profile_picture_bridge_operations"
    readonly 29132: "channels_in_app_policy_detail_enabled"
    readonly 29140: "animated_emoji_use_lazy_parsing"
    readonly 29161: "group_calling_wave_receiving_enabled"
    readonly 29172: "no_large_emoji_regex"
    readonly 29197: "wmi_async_await_prep"
    readonly 29204: "shortcake_companion_prologue__passkeys__handoff_enabled"
    readonly 29206: "shortcake_companion_prologue__passkeys__enabled"
    readonly 29209: "channels_questions_responses_drawer_loading_shimmer_enabled"
    readonly 29214: "vid_port_enable_capture_fps_median_filter"
    readonly 29217: "acs_use_graphql_for_migration_test"
    readonly 29218: "acs_use_graphql_for_forward_counter"
    readonly 29242: "enable_call_transfer_notification"
    readonly 29247: "group_calling_wave_sending_enabled"
    readonly 29279: "wa_web_large_group_presence_enabled"
    readonly 29280: "wa_web_small_group_presence_enabled"
    readonly 29290: "wa_meta_one_launch_free_trial_enabled"
    readonly 29293: "wa_web_match_primary_icons"
    readonly 29294: "web_anr_group_metadata_yield"
    readonly 29298: "biz_ai_web_onboarding_handoff"
    readonly 29308: "aura_media_offload_benefit_active"
    readonly 29314: "enable_sync_for_draft_messages"
    readonly 29332: "ctwa_3pd_data_sharing_title_change"
    readonly 29333: "ctwa_3pd_data_sharing_additional_logging"
    readonly 29342: "payments_upr_bubble_countries"
    readonly 29343: "mark_as_verified_enabled"
    readonly 29361: "enable_events_v2_entry_points_creation"
    readonly 29369: "wa_individual_new_chat_thread_capping_limit"
    readonly 29383: "biz_ai_tools_sync"
    readonly 29391: "aura_media_offload_enabled"
    readonly 29396: "web_read_self_watermark_receive_store_ts"
    readonly 29405: "web_anr_spinner_gpu_animation"
    readonly 29417: "enable_events_v2_add_to_calendar"
    readonly 29428: "rich_format_logging_enabled"
    readonly 29457: "wa_web_chat_themes_logging"
    readonly 29460: "web_anr_async_sqlite_bridge_operations"
    readonly 29484: "ctwa_external_ad_reply_url_allowlist_domains"
    readonly 29491: "web_remove_message_secret_from_quoted_enabled"
    readonly 29492: "web_move_message_secret_top_level_enabled"
    readonly 29510: "enable_webcodec_require_keyframe"
    readonly 29516: "channels_message_pin_admin_enabled"
    readonly 29517: "channels_message_pin_follower_enabled"
    readonly 29529: "ctwa_favorites_list_sends_signals"
    readonly 29543: "wa_web_expansion_countries_bonsai_enabled"
    readonly 29546: "web_read_self_watermark_send_store_ts"
    readonly 29548: "wa_win_pdf_rendering_enabled"
    readonly 29551: "web_anr_async_native_app_state_bridge_enabled"
    readonly 29554: "p2p_pills_allowlist"
    readonly 29564: "web_calling_offline_resume_ordering"
    readonly 29618: "web_whats_new_carousel"
    readonly 29619: "web_whats_new_banner"
    readonly 29621: "web_whats_new_auto_modal"
    readonly 29622: "web_whats_new_auto_modal_short_cooldown"
    readonly 29650: "premium_msg_bb_campaign_sync_enabled"
    readonly 29673: "group_enc_key_enabled"
    readonly 29706: "biz_ai_response_settings_ui_experiment"
    readonly 29708: "p2p_pills_allowlist_entries"
    readonly 29709: "web_whats_new_banner_short_cooldown_v2"
    readonly 29715: "p2p_pills_enabled_for_ineligible_contacts"
    readonly 29753: "wa_web_bot_orphan_logic_enabled"
    readonly 29764: "enable_web_voip_webtransport"
    readonly 29793: "enable_scheduled_calls_v2_entry_points_creation"
    readonly 29800: "ai_tab_unread_badge_recency_window_hours"
    readonly 29803: "payments_br_p2m_buyer_logging_phase_2"
    readonly 29836: "enable_web_voip_eager_mic_acquire"
    readonly 29866: "wa_meta_one_subscription_notifications_enabled"
    readonly 29874: "web_configurable_quick_actions_m1"
    readonly 29880: "web_get_msg_exist_optmise"
    readonly 29923: "wa_auth_agent_offboarding_enabled"
    readonly 29973: "group_history_setting_decouple_enabled"
    readonly 30000: "unified_response_ai_content_search_enabled"
    readonly 30041: "win_hybrid_bt_enabled"
    readonly 30043: "web_anr_skip_unused_contacts_db_updates_enabled"
    readonly 30084: "receipt_mode_bitmask_enabled"
    readonly 30140: "wa_web_adaptive_layout_enabled"
    readonly 30155: "channel_status_resharing_enabled"
    readonly 30165: "calling_voicemail_quoted_replies_enabled"
    readonly 30176: "dm_after_read_timer_sender_options_seconds"
    readonly 30208: "p2p_pills_auto_send_messages"
    readonly 30212: "wa_web_canonical_wam_falco_buffer_enabled"
    readonly 30214: "wa_webtp_use_async_pdf_send"
    readonly 30219: "wa_web_canonical_wam_falco_buffer_size"
    readonly 30227: "web_anr_optimized_initial_contacts_sync_enabled"
    readonly 30235: "media_force_transcode_on_elst"
    readonly 30260: "web_group_hover_card_variant"
    readonly 30261: "wa_web_voip_stack_log_level"
    readonly 30266: "biz_vpv_dimensions_logging_enabled"
    readonly 30270: "wa_web_biz_broadcasts_contextual_entrypoints"
    readonly 30276: "wmi_task_scheduler_second_step"
    readonly 30282: "enable_join_group_context_non_auto_expose"
    readonly 30330: "unified_response_markdown_links_enabled"
    readonly 30333: "group_history_new_user_threshold_secs"
    readonly 30344: "smb_do_label_localize_on_create_enabled_code"
    readonly 30345: "group_history_new_user_threshold_receiver_enforcement_secs"
    readonly 30350: "calling_screen_share_milestone_version"
    readonly 30352: "smb_do_label_localize_backfill_enabled_code"
    readonly 30360: "auth_agents_consumer_offboarding_exp_enabled"
    readonly 30383: "calling_voicemail_attached_icce_enabled"
    readonly 30384: "ptv_quoted_replies_cutout_enabled"
    readonly 30401: "ctwa_smb_lists_dropdown_application_fix_enabled"
    readonly 30417: "web_group_bulk_add_contact"
    readonly 30454: "opus_admin"
    readonly 30462: "group_history_receiver_dedup"
    readonly 30485: "web_bug_reporting_request_peer_log_enabled"
    readonly 30492: "server_driven_copy_m2"
    readonly 30493: "wa_web_rich_response_replying_enabled"
    readonly 30498: "inapp_signup_web_cta_logging_enabled"
    readonly 30539: "wavoip_ml_qpl_exp_tag"
    readonly 30561: "wavoip_legacy_ml_qpl_exp_tag"
    readonly 30568: "web_qp_smb_bb_recent_message_send"
    readonly 30569: "web_qp_smb_bb_pmf_test_high_engagement_user"
    readonly 30570: "web_qp_bb_re_engagement_past_29_days"
    readonly 30577: "web_coex_simple_signal_enabled"
    readonly 30578: "p2p_pills_new_business_metadata_enabled"
    readonly 30603: "wa_username_revocation_client_enabled"
    readonly 30604: "ai_search_ask_button_web_enabled"
    readonly 30629: "p2p_pills_graphql_enabled"
    readonly 30647: "payments_upr_custom_payment_methods_sync_countries"
    readonly 30661: "shortcake_companion_prologue__passkeys__assertion_timeout_seconds"
    readonly 30662: "shortcake_companion_prologue__passkeys__request_options_ttl_seconds"
    readonly 30753: "web_disable_compose_box_for_deprecated_chats"
    readonly 30771: "wa_webtp_pdf_sharer_consent_copy_v2"
    readonly 30796: "web_getters_lru_cache_size_limit"
    readonly 30797: "wa_catalog_graphql_use_lid_enabled"
    readonly 30826: "events_v2_hide_add_to_calendar_post_start_window_sec"
    readonly 30829: "web_conversation_cleanup_temp_collection"
    readonly 30912: "status_player_avatar_status_creation_entrypoint"
    readonly 30943: "p2p_pills_max_wait_on_contact_card_send"
    readonly 30960: "ai_subscription_metering_enabled"
    readonly 30964: "enable_events_v2_on_companion"
    readonly 30999: "channel_status_help_enabled"
    readonly 31009: "smb_qp_web_debug_recunit"
    readonly 31010: "ai_rich_response_remove_grouped_citations_count"
    readonly 31040: "ai_hatch_secret_encrypted_message_enabled"
    readonly 31046: "channels_questions_search_backtest_enabled"
    readonly 31047: "web_anr_disable_memory_logging"
    readonly 31063: "ai_3p_agent_chat_enabled"
    readonly 31094: "call_info_optimizations_lgc"
    readonly 31095: "call_info_optimizations_1on1"
    readonly 31096: "call_info_optimizations_ahgc_call_link"
    readonly 31098: "p2b_calling_availability_experiment_enabled"
    readonly 31103: "web_contact_collection_locale_listener"
    readonly 31107: "ai_video_upload_web_enabled"
    readonly 31113: "web_send_hid_failed_decrypt_in_receipts_enabled"
    readonly 31114: "web_send_orphan_in_receipts_enabled"
    readonly 31126: "web_ptt_render_throttling"
    readonly 31127: "web_new_event_emitter"
    readonly 31128: "web_new_wds_icons"
    readonly 31129: "web_optimized_event_handlers"
    readonly 31130: "web_optimized_pills"
    readonly 31159: "enable_windows_mocks_capture_drivers"
    readonly 31213: "qp_banner_sticker_animation_enabled"
    readonly 31224: "ctwa_3pd_data_sharing_disclosure_on_lists_home"
    readonly 31231: "biz_ai_meta_one_integration"
    readonly 31246: "wa_web_biz_profile_google_integration_enabled"
    readonly 31257: "web_optimized_avatars"
    readonly 31258: "web_optimized_message_tails"
    readonly 31259: "web_chats_content_visibility"
    readonly 31260: "web_messages_content_visibility"
    readonly 31261: "username_antiscraping_send_cached_un"
    readonly 31266: "lid_pn_username_mapping_logging_enabled"
    readonly 31282: "utility_order_view_mbs_enabled"
    readonly 31340: "wa_ohai_new_vip_header_enabled"
    readonly 31418: "events_v2_enable_notifications"
    readonly 31426: "wa_ctwa_web_enable_continuous_duration"
    readonly 31469: "p2p_pills_entries"
    readonly 31471: "p2p_pills_entries_enabled"
    readonly 31481: "web_voip_av_sync_debug_overlay"
    readonly 31494: "ai_hatch_video_avatars_enabled"
    readonly 31516: "invite_deactivated_user_web"
    readonly 31533: "web_guest_calling_representation_enabled"
    readonly 31542: "ai_pdfn_nux_ai_side_chat_notice_id"
    readonly 31560: "wa_qp_exposure_log_via_graphql_enabled"
    readonly 31580: "broadcast_to_your_followers_enabled"
    readonly 31592: "poll_tc_receiving_enabled"
    readonly 31593: "poll_tc_sending_enabled"
    readonly 31606: "wa_meta_one_eligibility_check_enabled"
    readonly 31614: "group_member_updates_past_participant_migration_enabled"
    readonly 31664: "channel_web_embedding_enabled"
    readonly 31676: "smb_bb_in_thread_insight_metrics_enabled"
    readonly 31682: "wa_web_biz_broadcast_collection_based_campaigns_enabled"
    readonly 31683: "web_status_ranking"
    readonly 31684: "web_status_ranking_enabled"
    readonly 31700: "smb_web_show_quick_reply_option_in_composer"
    readonly 31713: "ai_group_call_start_call_lgc_enabled"
    readonly 31716: "ai_group_call_start_call_ahgc_enabled"
    readonly 31717: "ai_group_call_add_in_call_lgc_enabled"
    readonly 31721: "web_media_encrypt_upload_in_worker_enabled"
    readonly 31729: "channels_view_counts_sender_admin_exclusion_mode"
    readonly 31736: "ai_group_call_start_call_notice_id"
    readonly 31780: "unified_response_ai_sports_widget_enabled"
    readonly 31781: "web_configurable_quick_actions_m1_channels"
    readonly 31782: "web_configurable_quick_actions_m1_communities"
    readonly 31784: "wa_web_velocity_animate_migration_enabled"
    readonly 31789: "wds_web_text_layout"
    readonly 31810: "enable_syncd_coex_v2"
    readonly 31842: "wa_web_biz_profile_preload"
    readonly 31845: "web_windows_calling_32p_version"
    readonly 31848: "payments_upr_turkey_enabled"
    readonly 31860: "payments_upr_uae_enabled"
    readonly 31864: "web_streaming_document_encrypt_min_bytes"
    readonly 31868: "payments_upr_hongkong_enabled"
    readonly 31869: "payments_upr_taiwan_enabled"
    readonly 31870: "payments_upr_egypt_enabled"
    readonly 31879: "channel_post_interaction_logging_enabled"
    readonly 31880: "biz_ai_large_screens_gate_fetch_enabled"
    readonly 31886: "pinned_messages_infinite_receiver_enabled"
    readonly 31887: "pinned_messages_infinite_sender_enabled"
    readonly 31922: "call_screen_share_dual_stream_app_update_dialog_enabled"
    readonly 31941: "ai_meta_ai_prekey_cleanup_enabled"
    readonly 31947: "wavoip_ml_media_mlow_companion_model_download_versions_v2"
    readonly 31960: "bb_chat_list_mab_3"
    readonly 31961: "bb_chat_list_mab_2"
    readonly 31962: "bb_chat_list_mab_5"
    readonly 31963: "bb_chat_list_mab_8"
    readonly 31964: "bb_chat_list_mab_4"
    readonly 31965: "bb_chat_list_mab_1"
    readonly 31966: "bb_chat_list_mab_10"
    readonly 31967: "bb_chat_list_mab_6"
    readonly 31968: "bb_chat_list_mab_9"
    readonly 31969: "bb_chat_list_mab_7"
    readonly 32007: "ctwa_web_native_ads_sabr_enabled"
    readonly 32008: "ai_unified_response_forwarding_sender_web_timestamp"
    readonly 32038: "poll_tc_cleanup_cron_enabled"
    readonly 32043: "payments_upr_mexico_wallet_enabled"
    readonly 32050: "web_business_broadcast_genai_text"
    readonly 32051: "web_business_broadcast_genai_text_model"
    readonly 32052: "web_business_broadcast_genai_custom_user_prompt_enabled"
    readonly 32053: "web_business_broadcast_genai_text_max_tries"
    readonly 32054: "web_bb_genai_composer_min_words"
    readonly 32055: "web_business_broadcast_genai_text_no_exp"
    readonly 32065: "wa_web_anr_pushname_check_enabled"
    readonly 32096: "smb_web_customer_manager_date_range_filter_enabled"
    readonly 32098: "username_creation_reservation_pp_disclosure_enabled"
    readonly 32100: "ctwa_longest_call_duration"
    readonly 32108: "ctwa_1pd_longest_call_enabled"
    readonly 32117: "web_business_broadcast_genai_text_languages"
    readonly 32124: "payments_upr_multiple_key_copy_enabled"
    readonly 32138: "enable_sticker_thumbnails_in_chat_list"
    readonly 32142: "message_partial_selection_m2"
    readonly 32144: "wa_webtp_use_pdf_annotations"
    readonly 32169: "payments_upr_mx_enabled"
    readonly 32170: "payments_upr_id_enabled"
    readonly 32186: "allow_backfill_with_v0_to_v1_primary_version_transition"
    readonly 32208: "bb_chat_list_banner_1"
    readonly 32209: "bb_chat_list_banner_2"
    readonly 32210: "bb_chat_list_banner_3"
    readonly 32211: "bb_chat_list_banner_4"
    readonly 32212: "bb_chat_list_banner_5"
    readonly 32213: "bb_chat_list_banner_6"
    readonly 32214: "bb_chat_list_banner_7"
    readonly 32215: "bb_chat_list_banner_8"
    readonly 32216: "bb_chat_list_banner_9"
    readonly 32217: "bb_chat_list_banner_10"
    readonly 32228: "wa_web_notifications_modal"
    readonly 32231: "web_top_level_message_secret_enforcement_enabled"
    readonly 32239: "snapl_newsletter_logging_encrypted_rid_enabled"
    readonly 32245: "ai_group_call_meta_ai_animation_version"
    readonly 32251: "bloks_a2ui_steps_enabled"
    readonly 32276: "a2ui_supported_elements"
    readonly 32277: "wa_web_notifications_modal_variants"
    readonly 32280: "web_optimized_compositing_layers"
    readonly 32287: "smb_web_customer_manager_export_enabled"
    readonly 32299: "enable_orbit_sso_bridge"
    readonly 32324: "enable_windows_xdr_wns_pkey"
    readonly 32367: "native_flow_response_message_params_json_max_size"
    readonly 32373: "bb_chat_list_banner_v1"
    readonly 32374: "bb_chat_list_banner_v2"
    readonly 32379: "ctwa_3pd_aggregated_call_logging_allowed"
    readonly 32393: "wa_web_wam_falco_flush_interval_ms"
    readonly 32396: "smb_tos_qp_chatlist_banner"
    readonly 32418: "wa_web_ptt_loader_button_uix_improvement"
    readonly 32428: "web_channel_status_likes_sending_enabled"
    readonly 32482: "mm_template_message_telemetry_is_first_mm_enabled"
    readonly 32490: "maiba_meta_ai_fab_nullstate_is_deprecated"
    readonly 32496: "ai_hatch_encrypted_media_enabled"
    readonly 32497: "hatch_pairing_from_companion_enabled"
    readonly 32511: "ctwa_web_native_ads_budget_recommendation_enabled"
    readonly 32527: "ai_group_call_start_call_logging_enabled"
    readonly 32550: "smb_web_customer_manager_bulk_edit_enabled"
    readonly 32551: "ai_rich_response_tee_forwarding_verification_enforcement_v1"
    readonly 32553: "scheduled_messages_photo_video_sender_enabled"
    readonly 32555: "enable_events_v2_invite_message_update"
    readonly 32588: "biz_ai_web_bulk_thread_control_enabled"
    readonly 32612: "enable_events_v2_invite_message_with_datetime"
    readonly 32613: "smb_web_bb_home_qp_surface_enabled"
    readonly 32614: "username_contact_card_dedupe_icons"
    readonly 32631: "wa_web_pathfinder_unsampling_config"
    readonly 32632: "wa_web_wam_falco_critical_event_ids"
    readonly 32683: "ai_rich_response_tee_forward_sending_enabled"
    readonly 32701: "ctwa_native_ads_inline_notice_modules"
    readonly 32702: "web_evict_thumbnail_hq_on_inactive"
    readonly 32723: "aura_focus_lists_enabled"
    readonly 32724: "aura_focus_lists_benefit_active"
    readonly 32752: "br_payments_multiple_pix_keys_enabled"
    readonly 32777: "ctwa_conversion_creation_from_delay_enabled"
    readonly 32778: "enable_poll_settings_label_improved_layout"
    readonly 32787: "web_search_results_type_date_filters"
    readonly 32798: "web_ptt_transcription_enabled"
    readonly 32799: "web_ptt_transcription_button_enabled"
    readonly 32800: "web_ptt_transcription_max_duration_seconds"
    readonly 32801: "channels_sgi_receiver_enabled"
    readonly 32802: "channels_sgi_sender_enabled"
    readonly 32804: "web_voip_adaptive_sctp_prewarm"
    readonly 32808: "channels_admin_notifications_forwards_enabled"
    readonly 32809: "username_activation_qp"
    readonly 32817: "ai_chat_meta_ai_null_state_web_enabled"
    readonly 32818: "wa_web_xb_bubble_enabled"
    readonly 32826: "payments_upr_send_key_from_web"
    readonly 32841: "enable_video_thumbnails_in_chat_list"
    readonly 32842: "enable_photo_thumbnails_in_chat_list"
    readonly 32843: "mc_enabled"
    readonly 32846: "biz_ai_fab_confirm_modal_enabled"
    readonly 32878: "wa_web_chat_themes_solid_wallpaper_sync_encode"
    readonly 32880: "wmi_jm_to_ts_m1"
    readonly 32881: "enable_calluser_video_deeplink"
    readonly 32896: "calling_dual_stream_camera_auto_off_enabled"
    readonly 32906: "biz_ai_web_gdrive_enabled"
    readonly 32910: "reveal_username_non_linking_rejection_reason_enabled"
    readonly 32920: "show_username_non_linking_rejection_reason_enabled"
    readonly 32946: "unknown_user_wam_max_events_per_window"
    readonly 32948: "username_search_without_atsign_enabled"
    readonly 32961: "ai_standard_bot_profile_enabled"
    readonly 32978: "username_unknown_user_logging_enabled"
    readonly 32990: "channels_sgi_sender_self_disclosure_enabled"
    readonly 33008: "wa_web_calling_sidenav_calls_tab_nux_enabled"
    readonly 33013: "primary_initiated_companion_contact_refresh"
    readonly 33019: "wa_web_chaining_from_my_status"
    readonly 33050: "ai_group_tee_require_additional_member_enabled"
    readonly 33083: "dedupe_lid_pn_identity_key_stores"
    readonly 33086: "smb_web_customer_manager_header_menu_enabled"
    readonly 33090: "ai_3p_bot_product_enabled"
    readonly 33093: "companion_contact_refresh"
    readonly 33109: "channels_sgi_ui_label_enabled"
    readonly 33122: "web_voip_outgoing_call_setup_latency_mode"
    readonly 33123: "companion_initiated_companion_contact_refresh"
    readonly 33131: "web_calling_smooth_call_link_lobby"
    readonly 33151: "web_voip_runtime_stack_selection_enabled"
    readonly 33153: "wa_web_calling_chat_empty_state_update_enabled"
    readonly 33154: "wa_web_calling_calls_tab_empty_state_update_enabled"
    readonly 33155: "wa_web_calling_whats_new_modal_update_enabled"
    readonly 33156: "show_fishfooding_toggle_in_bug_reporting_form"
    readonly 33160: "mm_template_message_telemetry_strict_first_mm_enabled"
    readonly 33169: "smb_business_broadcast_pro_web_scheduled_sends_enabled"
    readonly 33170: "wa_biz_payment_template_click_signals"
    readonly 33181: "web_chatlist_fts_listener_cleanup"
    readonly 33209: "aura_stickers_qp_banner_upsell_sheet_enabled"
    readonly 33219: "br_consumer_pix_sync_receive_enabled"
    readonly 33229: "ai_subscription_imagine_intent_metering_enabled"
    readonly 33235: "calling_dual_stream_camera_auto_off_include_low_data_usage"
    readonly 33244: "br_consumer_pix_sync_receive_web_enabled"
    readonly 33245: "wa_web_media_loader_button_uix_improvement"
    readonly 33263: "support_email_contact_form_logged_in_enabled"
    readonly 33281: "gc_device_switch_show_entry_point"
    readonly 33310: "web_voip_skip_offline_wait_on_call_intent"
    readonly 33334: "wa_web_inline_message_edit"
    readonly 33339: "web_link_preview_debounce_period_ms"
    readonly 33347: "wa_win_webtp_pdf_viewer_preload_enabled"
    readonly 33372: "wa_native_ads_xplat_draft_ads_ms1a_enabled"
    readonly 33374: "wa_native_ads_xplat_draft_ads_ms1a_dummy_enabled"
    readonly 33380: "device_capabilities_v2_sync_enabled"
    readonly 33384: "web_guest_calling_waiting_room_admin_xp_enabled"
    readonly 33385: "web_guest_calling_waiting_room_approval_note_enabled"
    readonly 33389: "web_voip_use_content_addressed_wasm"
    readonly 33393: "web_detached_dom_unmount_cleanup"
    readonly 33399: "wa_web_status_chain_from_chatlist"
    readonly 33400: "wa_web_status_chain_new_at_end"
    readonly 33413: "aura_focus_lists_schedule_enabled"
    readonly 33433: "wa_web_contact_and_chat_fuzzy_search_async_enabled"
    readonly 33446: "rust_accel_wacall_foundation_enabled"
    readonly 33448: "backfill_check_primary_identity_key"
    readonly 33469: "music_on_chats_standalone_receiver_enabled"
    readonly 33470: "music_on_chats_standalone_producer_enabled"
    readonly 33475: "web_whats_new_auto_modal_content_version"
    readonly 33497: "companion_contact_refresh_debounce_ms"
    readonly 33503: "inapp_signup_received_card_enabled"
    readonly 33504: "cap_context_info_max_array_length"
    readonly 33508: "ctwa_1pd_web_nbf_signals_enabled"
    readonly 33522: "aura_group_reactions_blocking_enabled"
    readonly 33531: "biz_ai_fab_enabled"
    readonly 33539: "enable_web_voip_webtransport_fallback"
    readonly 33541: "wa_web_defense_mode_quarantine_extra_pn_check"
    readonly 33548: "calling_dual_stream_camera_auto_off_poor_network_time_ms"
    readonly 33552: "calling_dual_stream_camera_auto_off_battery_threshold_pct"
    readonly 33556: "web_email_invites_group_info"
    readonly 33563: "web_memlab_fixes"
    readonly 33581: "enable_web_voip_audio_driver_lifetime_fix"
    readonly 33597: "enable_web_voip_worker_pool_reclaim_on_rejoin"
    readonly 33602: "biz_ai_handoff_timing_sync_enabled"
    readonly 33610: "wa_settings_read_receipts_copy_v2"
    readonly 33633: "android_inbox_mentions_replies_filter"
    readonly 33635: "companion_contact_refresh_receiver"
    readonly 33639: "wa_native_ads_web_creation_rollout"
    readonly 33640: "wa_native_ads_web_creation_dummy"
    readonly 33676: "ctwa_coex_state_sync_enabled"
    readonly 33708: "smb_contact_manager_sublist_enabled"
    readonly 33752: "wa_native_ads_web_creation_rollout_no_exposure"
    readonly 33753: "wa_web_win_hybrid_plus_enabled"
    readonly 33761: "channels_recommendation_unit_removal_v1_enabled"
    readonly 33783: "enable_fsa_save_as"
    readonly 33809: "whatsapp_orgs_enabled"
    readonly 33817: "wa_web_buttons_response_prop_removal_killswitch"
    readonly 33818: "enable_poll_results_contact_info_entry_point"
    readonly 33840: "channel_status_creation_profile_ring_enabled"
    readonly 33844: "wa_web_background_notifications"
    readonly 33883: "ctwa_smb_ae_companion_onboarding_enabled"
    readonly 33885: "ios_reaction_picker_wds_header_enabled"
    readonly 33886: "payments_upr_saudi_arabia_enabled"
    readonly 33887: "payments_upr_argentina_enabled"
    readonly 33888: "payments_upr_canada_enabled"
    readonly 33889: "payments_upr_colombia_enabled"
    readonly 33890: "payments_upr_peru_enabled"
    readonly 33891: "payments_upr_ghana_enabled"
    readonly 33892: "payments_upr_ethiopia_enabled"
    readonly 33893: "payments_upr_tanzania_enabled"
    readonly 33894: "payments_upr_cote_divoire_enabled"
    readonly 33896: "channels_admin_profiles_banner_enabled"
    readonly 33897: "channels_scheduling_updates_enabled"
    readonly 33898: "channels_scheduling_updates_message_types"
    readonly 33922: "payments_upr_south_africa_enabled"
    readonly 33926: "fmx_persistent_country_trust_signal_enabled"
    readonly 33928: "aura_focus_lists_exclusion_enabled"
    readonly 33934: "updates_tab_channels_header_explore_entry_point_visibility"
    readonly 33935: "updates_tab_channels_section_header_visibility"
    readonly 33936: "updates_tab_channels_show_unfollowed_search_results_enabled"
    readonly 33937: "updates_tab_channels_show_recommendation_unit_enabled"
    readonly 33953: "enable_web_voip_video_capture_dom_attach"
    readonly 33956: "biz_ai_web_integration_hub_enabled"
    readonly 33978: "teamlink_enabled"
    readonly 34003: "biz_ai_web_smart_composer_enabled"
    readonly 34019: "screening_audio_hint_enabled"
    readonly 34025: "group_settings_ia_prototype"
    readonly 34040: "attach_invitee_user_pn_in_offer"
    readonly 34045: "ctwa_3pd_conversion_on_ae_detection"
    readonly 34047: "functional_emoji_text_enabled"
    readonly 34053: "screening_audio_hint_supported_locales"
    readonly 34062: "br_consumer_delete_payment_info_web_enabled"
    readonly 34081: "ai_chat_threads_export_by_threads_enabled"
    readonly 34093: "enable_join_ongoing_call_refactor"
    readonly 34116: "enable_sticker_thumbnails_creation"
    readonly 34144: "web_calling_pause_bg_during_call_mode"
    readonly 34155: "lid_migration_daily_group_composition_enabled"
    readonly 34175: "enable_hybrid_open_with_shared_buffer"
    readonly 34186: "ai_3p_bot_product_chat_rendering_enabled"
    readonly 34199: "pix_payment_request_web_enabled"
    readonly 34202: "wa_biz_ai_appointment_connector_infra_enabled"
    readonly 34203: "biz_ai_web_hub_chat_enabled"
    readonly 34204: "biz_ai_web_ai_hub_chat_nav_enabled"
    readonly 34226: "username_key_entry_ui_v2"
    readonly 34231: "wa_biz_ai_1p_calendar_m1_enabled"
    readonly 34232: "unknown_user_target_rid_logging"
    readonly 34252: "aura_focus_lists_default_list_enabled"
    readonly 34257: "ai_web_ask_meta_ai_media_forward_enabled"
    readonly 34258: "web_status_recv_via_smax"
    readonly 34259: "web_status_send_via_smax"
    readonly 34271: "win_hybrid_vsr_enabled"
    readonly 34272: "win_hybrid_vsr_button_enabled"
    readonly 34276: "wa_coex_biz_ai_capping_eligible"
    readonly 34279: "win_hybrid_vsr_button_enabled_2"
    readonly 34280: "win_hybrid_vsr_enabled_2"
    readonly 34282: "biz_ai_suggested_reply_coaching_enabled"
    readonly 34290: "wa_biz_gap_enforcement_rules_sync_to_meta_enabled_ac_linked_user"
    readonly 34296: "web_e2e_status_likes_sending_enabled"
    readonly 34304: "web_loom_stuck_trace_timeout_ms"
    readonly 34305: "web_memlab_fixes_2"
    readonly 34324: "im_a2ui_require_bot_attribution"
    readonly 34337: "context_menu_content_fix"
    readonly 34341: "smb_bb_pro_business_verification"
    readonly 34343: "username_key_display_ui"
    readonly 34347: "username_key_min_length"
    readonly 34348: "username_key_max_length"
    readonly 34349: "wa_web_chat_themes_stock_wallpaper_sync_encode"
    readonly 34350: "username_key_regex"
    readonly 34366: "web_batched_status_sending_enabled"
    readonly 34369: "pinned_message_banner_notch_animation_enabled"
    readonly 34393: "ai_3p_agent_media_support_mode"
    readonly 34410: "wmi_jm_to_ts_serviced"
    readonly 34414: "web_self_adv_daily_use_lid"
    readonly 34450: "call_info_optimizations_1on1_context_menu"
    readonly 34465: "unknown_user_persistence_logging_enabled"
    readonly 34489: "status_viewer_action_psa_link_click_logging_enabled"
    readonly 34521: "ai_hatch_manage_subscription_enabled"
    readonly 34539: "web_batched_status_split_to_parts"
    readonly 34540: "web_status_batch_size"
    readonly 34541: "ai_3p_bot_product_nux_notice_id"
    readonly 34551: "unknown_user_wam_emit_cooldown_secs"
    readonly 34555: "br_consumer_pix_contact_info_web_enabled"
    readonly 34585: "message_partial_selection_in_bubble"
    readonly 34586: "ai_web_ask_meta_ai_improvement_enabled"
    readonly 34595: "biz_ai_agent_ai_editing_enabled"
    readonly 34622: "mm_user_controls_unified_stop_enabled"
    readonly 34626: "enable_lanczos_upscaler_for_vod_bitmap"
    readonly 34645: "enable_web_voip_webtransport_group_calls"
    readonly 34663: "ctwa_ae_signal_3pd_enabled"
    readonly 34665: "ctwa_ae_signal_3pd_field_policy"
    readonly 34670: "ai_commentary_standalone_messages_enabled"
    readonly 34685: "web_voip_pre_init_worker_bootstrap"
    readonly 34726: "wa_biz_url_cta_click_signals"
    readonly 34740: "calling_enable_dual_stream_receiver"
    readonly 34761: "wa_web_voip_mic_health_experience"
    readonly 34762: "wa_web_calling_chatlist_activation_banner_enabled"
    readonly 34763: "wa_web_calling_push_notification_on_call_end_enabled"
    readonly 34764: "md_stanzas_lid"
    readonly 34765: "wa_web_voip_mic_input_level"
    readonly 34768: "channels_admin_profiles_id_only_resolution_enabled"
    readonly 34784: "ai_subscription_media_editor_enabled"
    readonly 34791: "username_key_alphanumeric_charset"
    readonly 34795: "wa_nct_capping_kill_switch_enabled"
    readonly 34817: "web_calling_self_preview_enlarge"
    readonly 34826: "message_partial_selection_discoverability"
    readonly 34828: "smb_web_meta_ai_assistant_enabled"
    readonly 34829: "smb_web_meta_ai_image_input_languages"
    readonly 34831: "smb_web_ai_tos_master_notice_id"
    readonly 34840: "ai_hatch_manage_subscription_url"
    readonly 34857: "wavoip_large_vsr_model_download_versions_v2"
    readonly 34868: "whatsapp_orgs_fetch_cooldown_secs"
    readonly 34874: "payment_integrity_friction_p2m_upr_copy_enabled"
    readonly 34890: "web_validate_media_url_allowlist_enabled"
    readonly 34893: "wa_media_photo_experience_id"
    readonly 34894: "wa_media_video_experience_id"
    readonly 34895: "wa_media_sticker_experience_id"
    readonly 34897: "wa_media_document_experience_id"
    readonly 34898: "wa_media_ptt_audio_experience_id"
    readonly 34899: "wa_media_chat_photo_experience_id"
    readonly 34900: "wa_media_chat_video_experience_id"
    readonly 34901: "wa_media_chat_sticker_experience_id"
    readonly 34903: "wa_media_chat_document_experience_id"
    readonly 34904: "wa_media_chat_ptt_audio_experience_id"
    readonly 34905: "wa_media_status_photo_experience_id"
    readonly 34906: "wa_media_status_video_experience_id"
    readonly 34907: "wa_media_status_sticker_experience_id"
    readonly 34909: "wa_media_status_document_experience_id"
    readonly 34910: "wa_media_status_ptt_audio_experience_id"
    readonly 34911: "wa_media_channel_photo_experience_id"
    readonly 34912: "wa_media_channel_video_experience_id"
    readonly 34913: "wa_media_channel_sticker_experience_id"
    readonly 34915: "wa_media_channel_document_experience_id"
    readonly 34916: "wa_media_channel_ptt_audio_experience_id"
    readonly 34923: "web_voip_deferred_boot_init"
    readonly 34924: "web_voip_deferred_boot_init_max_delay_ms"
    readonly 34925: "web_voip_incoming_offer_init_freshness_ms"
    readonly 34935: "web_memories_subdomain_enabled"
    readonly 34940: "call_screening_voicemail_beep_tone"
    readonly 34943: "wa_media_text_experience_id"
    readonly 34944: "wa_media_chat_text_experience_id"
    readonly 34945: "wa_media_status_text_experience_id"
    readonly 34946: "wa_media_channel_text_experience_id"
    readonly 34947: "wa_media_other_experience_id"
    readonly 34948: "wa_media_chat_other_experience_id"
    readonly 34949: "wa_media_status_other_experience_id"
    readonly 34950: "wa_media_channel_other_experience_id"
    readonly 34955: "group_from_group_ban_risk_mitigation_enabled"
    readonly 34956: "group_from_group_admin_max_size"
    readonly 34981: "payments_upr_cameroon_enabled"
    readonly 34982: "payments_upr_jordan_enabled"
    readonly 34993: "hybrid_save_as_shared_buffer_enabled"
    readonly 35026: "payments_upr_algeria_enabled"
    readonly 35038: "ai_chat_threads_v1_deprecation_banner_max_impressions"
    readonly 35054: "payments_upr_angola_enabled"
    readonly 35055: "payments_upr_bahrain_enabled"
    readonly 35056: "payments_upr_benin_enabled"
    readonly 35057: "payments_upr_burkina_faso_enabled"
    readonly 35058: "payments_upr_costa_rica_enabled"
    readonly 35059: "payments_upr_dr_congo_enabled"
    readonly 35060: "payments_upr_djibouti_enabled"
    readonly 35061: "payments_upr_el_salvador_enabled"
    readonly 35062: "payments_upr_kuwait_enabled"
    readonly 35073: "xb_payments_send_money_v2_enabled"
    readonly 35074: "xb_payments_send_again_fetch_enabled"
    readonly 35091: "web_voip_deferred_boot_early_module_prefetch"
    readonly 35094: "wmi_async_await_prep_decrypt"
    readonly 35107: "web_org_admin_ui_enabled"
    readonly 35109: "media_cross_reference_upload_enabled"
    readonly 35111: "media_cross_reference_download_enabled"
    readonly 35115: "is_guest_calling_eligible"
    readonly 35119: "refresh_group_info_on_mismatch"
    readonly 35138: "teamlink_consumer_experience_enabled"
    readonly 35143: "web_calling_join_button_pulse_enabled"
    readonly 35144: "web_calling_incoming_accept_pulse_enabled"
    readonly 35167: "wa_media_experience_id_receive_enabled"
    readonly 35186: "smb_contact_manager_hidden_contacts_enabled"
    readonly 35194: "win_hybrid_vsr_device_setting_enabled_2"
    readonly 35210: "pq_1on1_messaging_killswitch"
    readonly 35221: "web_channel_status_likes_sending_enabled_no_exposure"
    readonly 35223: "biz_ai_web_onboarding_notification_dispatch_enabled"
    readonly 35238: "disable_message_secret_for_edit_to_bot"
    readonly 35240: "companion_contact_local_auto_heal"
    readonly 35270: "wa_webtp_edit_menu_copy_variant"
    readonly 35282: "ctwa_web_native_ads_continuous_duration_default"
    readonly 35283: "ctwa_web_native_ads_continuous_duration_default_dummy"
    readonly 35286: "payment_integrity_friction_p2m_upr_enabled"
    readonly 35290: "weave_upsell_wa_smb"
    readonly 35305: "pq_session_upgrade_max_devices_per_period"
    readonly 35318: "unknown_user_usync_request_cool_down"
    readonly 35321: "unknown_user_recovery_enabled"
    readonly 35334: "web_voip_webtransport_timeout_before_sctp_fallback_ms"
    readonly 35350: "is_preview_rich_format_enabled"
    readonly 35352: "wa_hybrid_use_minimal_window"
    readonly 35354: "wa_web_smb_chat_empty_state_v2_enabled"
    readonly 35376: "desktop_calling_ring_icon_enabled"
    readonly 35379: "wa_web_win_hybrid_plus_incoming_popout"
    readonly 35420: "enable_webcodec_video_encoder_output_watchdog"
    readonly 35422: "channels_scheduling_updates_receiver_enabled"
    readonly 35432: "mm_user_controls_unified_logging_symmetry_enabled"
    readonly 35456: "ctwa_1pd_conversion_excluded_message_type_ids"
    readonly 35457: "biz_ai_agent_ai_editing_secretless_send_enabled"
    readonly 35468: "biz_ai_agent_ai_editing_experiment"
    readonly 35473: "lanczos_min_upscale_scale_for_vod"
    readonly 35482: "enable_lanczos_upscaler_for_photos_bitmap"
    readonly 35488: "web_memlab_fixes_3"
    readonly 35491: "channels_scheduling_updates_window_duration_min_seconds"
    readonly 35492: "channels_scheduling_updates_window_duration_max_seconds"
    readonly 35512: "smb_biz_ai_suggested_reply_prefetch_cooldown_min"
    readonly 35531: "smb_biz_ai_suggested_reply_prefetch_count"
    readonly 35532: "aura_native_benefit_previews_enabled"
    readonly 35538: "biz_ai_suggested_reply_prefetch_enabled"
    readonly 35553: "group_history_send_adding_to_multiple_groups"
    readonly 35554: "group_history_send_adding_from_mention"
    readonly 35555: "group_history_send_adding_from_contact_message"
    readonly 35556: "group_history_send_admin_approval"
    readonly 35558: "ctwa_ctx_disclosure_update_enabled"
    readonly 35567: "enable_lanczos_video_chat_fullscreen"
    readonly 35568: "enable_lanczos_video_status_fullscreen"
    readonly 35569: "enable_lanczos_video_inline_chat"
    readonly 35572: "payments_upr_mauritania_enabled"
    readonly 35573: "payments_upr_morocco_enabled"
    readonly 35575: "payments_upr_mozambique_enabled"
    readonly 35576: "payments_upr_oman_enabled"
    readonly 35577: "payments_upr_panama_enabled"
    readonly 35578: "payments_upr_qatar_enabled"
    readonly 35579: "payments_upr_senegal_enabled"
    readonly 35580: "payments_upr_sierra_leone_enabled"
    readonly 35581: "payments_upr_togo_enabled"
    readonly 35583: "payments_upr_tunisia_enabled"
    readonly 35584: "payments_upr_guatemala_enabled"
    readonly 35585: "payments_upr_iraq_enabled"
    readonly 35593: "biz_ai_enable_download"
    readonly 35609: "ctwa_1pd_message_type_exclusions_enabled"
    readonly 35650: "wa_vpv_logging_phases_enabled"
    readonly 35651: "biz_ai_suggested_reply_auto_fetch_limit_enabled"
    readonly 35652: "smb_biz_ai_suggested_reply_no_action_threshold"
    readonly 35658: "ai_group_tasks_enabled"
    readonly 35677: "poll_add_option_participant_enabled"
    readonly 35682: "br_payments_add_pix_key_deeplink_enabled"
    readonly 35683: "br_payments_add_pix_key_deeplink_allowlist"
    readonly 35688: "web_getters_lazy_slot_allocation"
    readonly 35716: "web_voip_video_presentation_orientation_fix"
    readonly 35738: "wa_web_wrap_associated_child_message_enabled"
    readonly 35744: "pq_session_upgrade_period_days"
    readonly 35746: "ai_reminders_m1_enabled"
    readonly 35752: "channels_quiz_option_reshuffle_enabled"
    readonly 35760: "ai_fbid_db_migration_version_pre_chatd"
    readonly 35771: "poll_add_option_creator_enabled"
    readonly 35784: "br_payments_options_to_pay_sheet_enabled"
    readonly 35797: "wmi_jm_to_ts_queues"
    readonly 35798: "wmi_jm_to_ts_rest"
    readonly 35799: "channels_ai_at_enabled"
    readonly 35805: "aura_focus_lists_setup_enabled"
    readonly 35806: "im_a2ui_reply_quote_enabled"
    readonly 35871: "wa_native_ads_web_add_media_rollout"
    readonly 35872: "wa_native_ads_web_add_media_dummy"
    readonly 35896: "wa_web_calling_call_user_journey_logging_enabled"
    readonly 35906: "channels_quiz_option_reshuffle_notice_enabled"
    readonly 35926: "retry_receipt_new_session_enabled"
    readonly 35949: "web_voip_audio_playback_use_media_element_output"
    readonly 35965: "payments_row_upr_buyer_logging"
    readonly 35987: "group_history_after_join_sender_prerequisites"
    readonly 36006: "channels_question_admin_starring_enabled"
    readonly 36012: "wa_web_browser_notifications_popup_guide"
    readonly 36018: "music_on_chats_geogating_enabled"
    readonly 36027: "ai_hatch_revoke_enabled"
    readonly 36028: "payments_upr_bolivia_enabled"
    readonly 36049: "br_payments_enhanced_text_message_cta_logging_fix"
    readonly 36054: "wavoip_large_uvq_model_download_versions"
    readonly 36056: "wamedia_large_vsr_model_download_versions"
    readonly 36067: "media_elst_timing_refinement_enabled"
    readonly 36069: "guest_calling_call_log_mitigation_enabled"
    readonly 36083: "voip_aleg_v1_enabled"
    readonly 36091: "acp2_enabled"
    readonly 36094: "calling_exp_target_sample_ss"
    readonly 36105: "web_memlab_fixes_backup"
    readonly 36113: "wa_web_notifications_modal_timer"
    readonly 36178: "companion_contact_local_auto_heal_hours"
    readonly 36184: "web_voip_pin_worker_glue_to_wasm"
    readonly 36187: "bizai_smb_mx_m2_upsell"
    readonly 36197: "acp2_futureproof_enabled"
    readonly 36222: "biz_ai_web_appointments_enabled"
    readonly 36245: "group_join_validation_questions_setting_enabled"
    readonly 36250: "ai_unified_response_video_mutation_enabled"
    readonly 36251: "ai_search_null_state_convo_starter_gql_enabled"
    readonly 36263: "ai_hatch_activity_enabled"
    readonly 36276: "web_voip_live_caption_probe_enabled"
    readonly 36294: "web_ai_sticker_emission_enabled"
    readonly 36304: "ai_chat_action_logging_addition_enabled"
    readonly 36322: "group_membership_form_setting_enabled"
    readonly 36339: "br_consumer_payments_web_enabled"
    readonly 36352: "payments_upr_chile_enabled"
    readonly 36353: "payments_upr_dominican_republic_enabled"
    readonly 36354: "payments_upr_ecuador_enabled"
    readonly 36355: "payments_upr_honduras_enabled"
    readonly 36356: "payments_upr_nicaragua_enabled"
    readonly 36357: "payments_upr_paraguay_enabled"
    readonly 36358: "payments_upr_uruguay_enabled"
    readonly 36359: "payments_upr_lebanon_enabled"
    readonly 36360: "payments_upr_libya_enabled"
    readonly 36361: "payments_upr_mali_enabled"
    readonly 36372: "rt_sender_v3_hybrid_mode"
    readonly 36374: "rt_receiver_missing_reporting_token_detection"
    readonly 36379: "channels_question_view_your_responses_enabled"
    readonly 36380: "channels_question_response_like_admin_enabled"
    readonly 36381: "channels_question_response_like_follower_enabled"
    readonly 36424: "aura_original_quality_media_enabled"
    readonly 36425: "aura_original_quality_media_benefit_active"
    readonly 36428: "enable_rx_video_enhance_chat_fullscreen"
    readonly 36429: "enable_rx_video_enhance_status"
    readonly 36449: "aura_custom_reactions_kill_switch"
    readonly 36453: "auth_reps_consumer_ai_group_block_enabled"
    readonly 36472: "ai_hatch_approval_notification_enabled"
    readonly 36497: "smb_web_customer_management_import_export"
    readonly 36498: "group_history_send_default_on"
    readonly 36499: "group_history_send_once_default_on"
    readonly 36500: "group_history_send_admin_set_default_on"
    readonly 36501: "group_history_per_group_toggle_md_sync"
    readonly 36510: "rx_video_enhance_sharpen_strength_x1000"
    readonly 36517: "rx_video_enhance_max_short_edge_px"
    readonly 36521: "wa_force_fail_meta_one_smb_eligibility"
    readonly 36539: "bug_reporting_request_call_peer_log"
    readonly 36550: "enable_web_voip_webtransport_fast_setup"
    readonly 36559: "music_on_chats_artwork_pixel_side_size"
    readonly 36574: "wa_hybrid_collect_new_memory_metrics"
    readonly 36576: "smb_web_customer_management_custom_fields"
    readonly 36583: "scheduled_messages_smart_defaults"
    readonly 36628: "sound_stickers_consumption_enabled"
    readonly 36629: "sound_stickers_creation_enabled"
    readonly 36630: "sound_stickers_audio_playing_enabled"
    readonly 36646: "inbox_dim_muted_chats"
    readonly 36716: "wa_webtp_print_pdf_enabled"
    readonly 36759: "ai_meta_ai_thread_rendering_enabled"
    readonly 36763: "acp2_group_chats_enabled"
    readonly 36791: "payments_receipt_and_state_copy_pix_key_p2p"
    readonly 36796: "payments_receipt_and_state_copy_pix_key_p2m"
    readonly 36801: "web_status_likes_poster_counter_enabled"
    readonly 36803: "web_voip_relay_setup_yield_ipv4_first"
    readonly 36804: "web_voip_low_core_ipv6_relay_delay_ms"
    readonly 36805: "web_voip_call_end_teardown_yield"
    readonly 36806: "ai_meta_ai_thread_inbox_filter_enabled"
    readonly 36811: "payments_receipt_and_state_copy_pix_code_p2m"
    readonly 36837: "p2p_pills_contact_share_sender_enabled"
    readonly 36838: "p2p_pills_contact_share_receiver_enabled"
    readonly 36841: "enable_1on1_call_transfer_entry_point"
    readonly 36842: "enable_call_transfer_auto_switch"
    readonly 36843: "enable_call_transfer_log_consolidation"
    readonly 36854: "lists_smb_web_m2_enabled2"
    readonly 36868: "biz_ai_upr_indonesia_enabled"
    readonly 36878: "biz_ai_upr_id_enabled"
    readonly 36910: "ctwa_web_native_ads_catalog_media_enabled"
    readonly 36911: "web_call_push_notification_require_interaction"
    readonly 36913: "web_voip_call_push_notification_clear_timeout_sec"
    readonly 36916: "ctwa_web_native_ads_catalog_media_enabled_dummy"
    readonly 36921: "group_membership_form_max_questions"
    readonly 36941: "group_membership_form_join_enabled"
    readonly 36956: "channels_quiz_option_reshuffle_enabled_no_exposure"
    readonly 36998: "wa_web_send_hd_photo"
    readonly 36999: "wa_web_show_hd_video"
    readonly 37000: "wa_web_send_hd_video"
    readonly 37001: "wa_web_show_hevc_video"
    readonly 37002: "wa_web_send_hevc_video"
    readonly 37003: "wa_web_show_motion_photo"
    readonly 37004: "wa_web_send_motion_photo"
    readonly 37054: "ai_hatch_space_enabled"
    readonly 37056: "ai_rich_response_content_types_logging_mode"
    readonly 37058: "web_voip_dtls_cert_cache_mode"
    readonly 37062: "wa_thumbnail_gen_in_worker_enabled"
    readonly 37076: "br_payments_add_pix_key_message_enabled"
    readonly 37084: "wa_web_voip_speaker_menu_split"
    readonly 37085: "wa_web_voip_device_menu_animation_stagger_ms"
    readonly 37116: "wa_web_calling_settings_mode"
    readonly 37121: "wa_web_voip_mic_health_compact_affordance"
    readonly 37126: "channels_directory_flat_categories_list_enabled"
    readonly 37128: "win_hybrid_eager_device_watching"
    readonly 37137: "aura_stickers_suggestions_enabled"
    readonly 37140: "wa_web_voip_audio_device_list_dedupe"
    readonly 37163: "group_membership_form_question_max_length"
    readonly 37166: "contact_manager_mvp_enabled"
    readonly 37167: "web_voip_adaptive_sctp_prewarm_v2"
    readonly 37182: "wa_navchain_context_resolution_enabled"
    readonly 37184: "pre_call_logging_enabled"
    readonly 37185: "ctwa_3pd_aggregated_label_logging_allowed"
    readonly 37186: "ctwa_3pd_per_customer_data_sharing_always_shown"
    readonly 37187: "ctwa_3pd_data_sharing_after_first_biz_reply"
    readonly 37213: "status_archive_refetch_old_music_artwork_enabled"
    readonly 37222: "ai_hatch_signup_trusted_hosts"
    readonly 37223: "ai_hatch_ideas_enabled"
    readonly 37224: "ai_hatch_mweb_signup_enabled"
    readonly 37227: "ai_hatch_connectors_enabled"
    readonly 37235: "document_format_verification_mime_exclusions"
    readonly 37236: "document_format_verification_enabled"
    readonly 37238: "ai_hatch_subscription_ui_enabled"
    readonly 37240: "ai_hatch_media_enabled"
    readonly 37251: "ks_pdf_strict_validation_enabled"
    readonly 37272: "biz_ai_upr_countries"
    readonly 37275: "web_voip_av_sync_strict_fifo_drain"
    readonly 37276: "web_voip_video_drop_out_of_order_frames"
    readonly 37278: "server_sent_invites_web_enabled"
    readonly 37282: "wa_web_calling_calls_tab_notifications_off_banner_enabled"
    readonly 37284: "web_email_invites_server_send_enabled"
    readonly 37294: "web_message_list_skip_noop_scroll_anchor"
    readonly 37295: "wa_native_ads_web_advertise_badge_enabled"
    readonly 37296: "wa_native_ads_web_advertise_badge_dummy_enabled"
    readonly 37302: "channels_invite_link_preview_reliability_enabled"
    readonly 37323: "call_screening_caller_version"
    readonly 37337: "call_screening_callee_version"
    readonly 37344: "pinned_messages_remove_30_day_pins"
    readonly 37356: "wa_web_enable_test_notification"
    readonly 37370: "aura_stickers_suggestions_overlay_enabled"
    readonly 37376: "wa_media_ptt_experience_id"
    readonly 37379: "wa_media_audio_experience_id"
    readonly 37381: "channel_status_admin_insights_enabled"
    readonly 37383: "wa_media_url_experience_id"
    readonly 37384: "wa_media_reaction_experience_id"
    readonly 37385: "wa_media_chat_ptt_experience_id"
    readonly 37386: "wa_media_chat_audio_experience_id"
    readonly 37387: "wa_media_chat_url_experience_id"
    readonly 37388: "wa_media_chat_reaction_experience_id"
    readonly 37389: "wa_media_status_reaction_experience_id"
    readonly 37390: "wa_media_status_url_experience_id"
    readonly 37391: "wa_media_status_audio_experience_id"
    readonly 37392: "wa_media_status_ptt_experience_id"
    readonly 37393: "wa_media_channel_url_experience_id"
    readonly 37394: "wa_media_channel_audio_experience_id"
    readonly 37395: "wa_media_channel_ptt_experience_id"
    readonly 37396: "wa_media_channel_reaction_experience_id"
    readonly 37398: "aura_stickers_suggestions_weight"
    readonly 37450: "web_voip_browser_mute_toast_enabled"
    readonly 37451: "fmx_manage_messages_simplified_logging_symmetry_enabled"
    readonly 37465: "enable_syncd_write_coex_v2"
    readonly 37476: "ai_hatch_upsell_in_agents_screen_enabled"
    readonly 37481: "wa_web_meta_one_dev"
    readonly 37490: "web_voip_pthread_hardening_level"
    readonly 37509: "ks_ogg_opus_strict_validation_enabled"
    readonly 37588: "ai_hatch_identity_enabled"
    readonly 37611: "aura_focus_lists_kill_switch"
    readonly 37615: "wa_subs_cancel_anytime_enabled"
    readonly 37616: "wa_subs_try_for_zero_enabled"
    readonly 37617: "wa_subs_benefit_loss_enabled"
    readonly 37618: "sticker_non_square_rendering_enabled"
    readonly 37630: "server_sent_invites_for_groups_web_enabled"
    readonly 37638: "payments_receipt_and_state_copy_pix_code_p2p"
    readonly 37639: "ai_hatch_3p_bot_enabled"
    readonly 37650: "document_format_verification_enforcement_enabled"
    readonly 37665: "ai_hatch_upsell_in_agents_screen_variant"
    readonly 37686: "payments_receipt_and_state_details_kill_switch"
    readonly 37690: "wa_web_search_highlight_offset_normalization_enabled"
    readonly 37731: "poll_creator_edit_option_removal_enabled"
    readonly 37732: "poll_creator_remove_added_option_enabled"
    readonly 37734: "poll_participant_remove_added_option_enabled"
    readonly 37737: "thread_interactions_falco_native_logging_enabled"
    readonly 37761: "smb_business_broadcast_pro_min_audience_recipients"
    readonly 37762: "ai_pdfn_nux_ai_group_muse_initiator_notice_id"
    readonly 37763: "ai_pdfn_nux_ai_group_muse_non_initiator_notice_id"
    readonly 37766: "ai_standard_bot_profile_group_enabled"
    readonly 37767: "ai_hatch_3p_bot_group_add_enabled"
    readonly 37770: "overscroll_logo_enabled"
    readonly 37775: "chat_interactive_preview_enabled"
    readonly 37777: "ai_hatch_gzip_encoding_enabled"
    readonly 37778: "ai_bot_group_soak_enabled"
    readonly 37782: "web_voip_playback_restart_after_mic_mode"
    readonly 37785: "smb_web_create_ad_chatlist_qp_enabled"
    readonly 37787: "smb_web_create_ad_chatlist_qp_dummy_enabled"
    readonly 37788: "smb_web_create_ad_chatlist_qp_filter_enabled"
    readonly 37789: "smb_web_create_ad_chatlist_qp_filter_dummy_enabled"
    readonly 37791: "ai_hatch_3p_bot_group_add_companion_enabled"
    readonly 37793: "ai_hatch_3p_bot_group_add_tee_removal_enabled"
    readonly 37818: "payments_receipt_and_state_web_state_hide_kill_switch"
    readonly 37827: "win_hybrid_background_message_sync"
    readonly 37833: "waweb_deprecate_initial_sync_ordering"
    readonly 37844: "wa_web_jm_to_ts_queues"
    readonly 37846: "wa_web_jm_to_ts_rest"
    readonly 37847: "wa_web_jm_to_ts_serviced"
    readonly 37852: "ai_hatch_secure_credentials_enabled"
    readonly 37854: "ai_hatch_browser_enabled"
    readonly 37855: "ai_group_directed_send_agent_legs_enabled"
    readonly 37856: "ai_hatch_data_controls_enabled"
    readonly 37857: "ai_hatch_scheduled_tasks_enabled"
    readonly 37865: "biz_ai_agent_demo_mode_v2_enabled"
    readonly 37876: "ctwa_smb_h2_2026_ofs_migration_enabled"
    readonly 37881: "ai_multimodal_all_languages_enabled"
    readonly 37882: "ai_subscriptions_u18_age_gate_required"
    readonly 37885: "ai_html_viewer_forward_action_enabled"
    readonly 37900: "ks_allow_av1_video_codec"
    readonly 37909: "poll_relaxed_option_count_receiving_enabled"
    readonly 37910: "poll_add_option_revoke_receiving_version"
    readonly 37911: "wa_web_subscriptions_entry_point_settings_enabled"
    readonly 37912: "wa_web_meta_one_biz_tools_entry_point_enabled"
    readonly 37934: "call_screening_setting_data_version"
    readonly 37944: "audio_format_verification_enabled"
    readonly 37948: "message_yourself_edit_window_is_forever_enabled"
    readonly 37964: "wavoip_large_ml_disk_check_enabled"
    readonly 37965: "wavoip_large_ml_min_free_disk_headroom_mb"
    readonly 37983: "ai_hatch_vm_auth_enabled"
    readonly 37987: "wa_web_meta_one_biz_ai_entry_point_enabled"
    readonly 38009: "web_voip_ringing_lobby_preview_gate_enabled"
    readonly 38023: "contact_manager_sub_gating_enabled"
    readonly 38034: "web_getters_clear_caches_on_memory_pressure"
    readonly 38036: "web_getters_clear_caches_on_memory_over_mb"
    readonly 38037: "enable_vsr_status_fullscreen"
    readonly 38038: "enable_vsr_chat_fullscreen"
    readonly 38039: "vod_vsr_max_short_edge"
    readonly 38058: "thread_interactions_received_excludes_edits_web_enabled"
    readonly 38066: "wa_subs_wa_plus_paywall_optimization_enabled"
    readonly 38067: "wa_subs_mo_consumer_paywall_optimization_enabled"
    readonly 38109: "pibx_vip_max_fave_list_len"
    readonly 38120: "wa_consumer_subscription_u18_gating_enabled"
    readonly 38125: "ai_meta_ai_thread_server_delete_enabled"
    readonly 38128: "wamo_status_sensitive_vertical_disclaimer_enabled"
    readonly 38129: "capi_messaging_pairs_client_enabled"
    readonly 38134: "group_membership_form_review_enabled"
    readonly 38135: "br_payments_payment_method_weights"
    readonly 38142: "ai_hatch_first_party_connectors_enabled"
    readonly 38165: "thread_interactions_channel_reads_aligned_web_enabled"
    readonly 38169: "pibx_max_fave_chats_in_imp_list"
    readonly 38174: "ks_mp4_strict_validation_enabled"
    readonly 38175: "wa_web_forward_add_message_enabled"
    readonly 38177: "expanded_formatting_multiline_quotes"
    readonly 38221: "wa_web_meta_one_subscription_notifications_enabled"
    readonly 38244: "wmi_wa_web_message_delivery_qpl_instrumentation"
    readonly 38245: "wmi_wa_web_one_queue_adoption"
    readonly 38247: "wmi_wa_web_persisted_queue"
    readonly 38252: "wa_web_calling_call_user_journey_logging_m2_enabled"
    readonly 38263: "vod_sharpen_filter_max_short_edge"
    readonly 38265: "vod_sharpen_filter_strength"
    readonly 38266: "wa_sticker_store_insights_country_threshold"
    readonly 38267: "enable_vod_sharpen_chat_fullscreen"
    readonly 38268: "enable_vod_sharpen_status"
    readonly 38269: "vod_sharpen_filter_min_short_edge"
    readonly 38275: "thread_interactions_channel_own_posts_sent_web_enabled"
    readonly 38292: "enable_advanced_sticker_testing"
    readonly 38294: "web_audience_import_segment_text"
    readonly 38321: "ai_meta_ai_thread_default_profile_pic_type"
    readonly 38364: "capi_messaging_pairs_vpv_enabled"
    readonly 38380: "enable_vod_itm_chat_fullscreen"
    readonly 38381: "vod_itm_min_short_edge"
    readonly 38382: "vod_itm_max_short_edge"
    readonly 38383: "enable_vod_itm_status"
    readonly 38384: "vod_itm_approach"
    readonly 38386: "ai_meta_ai_muse_default_assistant_variant"
    readonly 38393: "web_voip_device_access_recovery_enabled"
    readonly 38409: "ai_hatch_whatsapp_connector_enabled"
    readonly 38414: "waweb_comms_in_backend_worker"
    readonly 38441: "ai_hatch_space_public_in_app_enabled"
    readonly 38458: "wa_web_calling_calls_tab_new_call_fab_enabled"
    readonly 38463: "wa_web_media_thumbnail_key_match_enabled"
    readonly 38464: "wa_web_media_fast_forward_same_key_type_enabled"
    readonly 38467: "wa_hatch_mweb_onboarding_url"
    readonly 38514: "ai_hatch_noise_teardown_interval_ms"
    readonly 38516: "calling_rust_migration_scope1_bitmap"
    readonly 38542: "ai_hatch_connectors_supported_types"
    readonly 38578: "wa_webtp_skip_sharer_confirmation_variant"
    readonly 38611: "wa_web_calling_new_call_drawer_actions_enabled"
    readonly 38616: "wa_web_calling_calls_tab_overflow_menu_enabled"
    readonly 38617: "ai_hatch_fab_animation_variant"
    readonly 38618: "ai_hatch_fab_enabled"
    readonly 38644: "ai_rich_response_source_reporting_long_press_enabled"
    readonly 38646: "groups_mex_fetch_membership_approval_requests_enabled"
    readonly 38651: "ai_hatch_chat_avatar_animated_collapse_enabled"
    readonly 38652: "ai_hatch_theme_enabled"
    readonly 38658: "ai_meta_ai_thread_profile_pic_badge_enabled"
    readonly 38669: "wa_web_calling_notification_icons_enabled"
    readonly 38672: "wa_web_media_download_rmr_on_hash_mismatch_enabled"
    readonly 38675: "wa_web_calling_incoming_call_tab_indicator_enabled"
    readonly 38676: "ai_hatch_options_card_enabled"
    readonly 38695: "channels_migration_banner_hca_link_is_visible"
    readonly 38719: "status_full_my_status_header_is_posting_entrypoint_enabled"
    readonly 38720: "klipy_memes_enabled"
    readonly 38773: "ai_hatch_response_ux_parity_enabled"
    readonly 38790: "web_channel_video_dash_enabled"
    readonly 38808: "ai_hatch_custom_connectors_enabled"
    readonly 38861: "wa_subs_wa_plus_hero_benefits_on_paywall_enabled"
    readonly 38862: "win_hybrid_tray_wake_keep_resumed_seconds"
    readonly 38870: "win_hybrid_extension_skip_reinstall"
    readonly 38882: "expanded_formatting_menu_items_enabled"
    readonly 38905: "aura_native_benefit_previews_effects_enabled"
    readonly 38920: "ks_mp4_fragmented_streaming_enabled"
    readonly 38966: "music_on_chats_style_message_bubble_receiver_enabled"
    readonly 38967: "music_on_chats_style_message_bubble_producer_enabled"
    readonly 38968: "music_on_chats_style_lyrics_receiver_enabled"
    readonly 38969: "music_on_chats_style_lyrics_producer_enabled"
    readonly 38999: "smb_business_broadcast_pro_enabled_no_exp"
    readonly 39007: "community_permissions_redesign_enabled"
    readonly 39016: "web_calling_missed_call_banner"
    readonly 39027: "ai_rich_response_jarvis_forward_sending_enabled"
    readonly 39033: "ai_rich_response_jarvis_forward_receiving_enabled"
    readonly 39046: "aura_premium_sticker_freemium_allowance"
    readonly 39057: "deleted_message_system_style_enabled"
    readonly 39075: "overscroll_logo_theme"
    readonly 39076: "wa_web_meta_one_mock_billing"
    readonly 39086: "aura_group_reactions_editor_enabled"
    readonly 39093: "ai_hatch_vm_capability_sync_enabled"
    readonly 39096: "web_voip_camera_fingerprint_logging_enabled"
    readonly 39098: "web_status_vpv_successful_view_consistency_enabled"
    readonly 39099: "web_status_vpv_rebuffering_load_time_enabled"
    readonly 39100: "web_status_vpv_per_view_load_time_enabled"
    readonly 39101: "web_status_vpv_result_at_exit_enabled"
    readonly 39115: "ai_hatch_in_app_subscriptions_enabled"
    readonly 39137: "ai_hatch_avatar_working_video_enabled"
    readonly 39144: "wa_subs_sub_management_page_enabled"
    readonly 39145: "ai_meta_ai_muse_chat_readonly_message_drop_variant"
    readonly 39154: "wa_teamlink_invitation_privacy_gate_enabled"
    readonly 39167: "ai_hatch_in_app_activation_enabled"
    readonly 39179: "falco_md_id_fix_web_enabled"
    readonly 39187: "win_hybrid_bridge_ui_thread_completion_enabled"
    readonly 39208: "music_on_chats_internal_acs_enabled"
    readonly 39224: "status_companion_read_sync_fix_enabled"
    readonly 39242: "enhanced_mention_suggestions_allow_non_group_members_with_group_members"
    readonly 39301: "payments_upr_confirmation_countries"
    readonly 39307: "web_memlab_fixes_4"
    readonly 39326: "ai_rich_response_jarvis_forward_verification_enabled"
    readonly 39327: "ai_hatch_permission_enable"
    readonly 39332: "biz_ai_upr_mx_enabled"
    readonly 39337: "group_admin_hub"
    readonly 39382: "sticker_non_square_max_aspect_ratio"
    readonly 39411: "community_share_invite_setting_enabled"
    readonly 39433: "web_calling_offline_call_notifications"
    readonly 39440: "web_media_fast_forward_match_key_type_entry_enabled"
    readonly 39441: "mm_signal_sharing_post_dc_message_type_enabled"
    readonly 39445: "wa_smb_orders_deprecation_banners"
    readonly 39455: "br_payments_pix_save_logging_source_enabled"
    readonly 39461: "aura_upsell_generic_headline_enabled"
    readonly 39462: "ai_hatch_theme_colors_enabled"
    readonly 39481: "aura_native_onboarding_enabled"
    readonly 39494: "web_voip_browser_permission_button_enabled"
    readonly 39501: "win_hybrid_expiry_server_time_killswitch"
    readonly 39502: "win_hybrid_expiry_wrong_clock_block_enabled"
    readonly 39512: "web_add_member_smart_suggestions_enabled"
    readonly 39514: "web_resync_unreadable_participant_rows"
    readonly 39517: "wa_web_drag_and_drop_capabilities"
    readonly 39526: "sticker_non_square_sending_enabled"
    readonly 39543: "aura_profile_badge_enabled"
    readonly 39561: "ctwa_custom_label_server_mapping_allowed"
    readonly 39620: "aura_live_read_receipts_enabled"
    readonly 39621: "mex_group_join"
    readonly 39648: "active_integrity_holdout_enabled"
    readonly 39649: "web_community_setting_add_members_enabled"
    readonly 39657: "web_retry_receipt_logging_enabled"
    readonly 39659: "spoilers_status_sender_enabled"
    readonly 39660: "spoilers_status_receiver_enabled"
    readonly 39673: "community_invite_new_share_sheet_enabled"
    readonly 39699: "web_voip_ml_disable_threadpool"
    readonly 39722: "web_voip_deferred_boot_hidden_prewarm"
    readonly 39756: "ks_jpeg_scan_strict_validation_enabled"
    readonly 39775: "aura_original_quality_video_tuning"
    readonly 39787: "aura_original_quality_media_menu_enabled"
    readonly 39802: "wamedia_vsr_model_in_test_versions"
    readonly 39803: "chat_vsr_model"
    readonly 39804: "status_vsr_model"
    readonly 39819: "third_party_media_provider_request_logging_enabled"
    readonly 39834: "web_improve_subtle_new_group_icon_in_forward"
    readonly 39853: "wa_web_floating_chat_chrome"
    readonly 39858: "web_voip_tcp_connection_fallback"
    readonly 39862: "wa_web_floating_chrome"
    readonly 39872: "work_send_enabled"
    readonly 39899: "web_voip_tcp_connection_fallback_before_accept"
    readonly 39905: "web_invite_options_in_add_membes_enabled"
    readonly 39912: "wa_hatch_companion_onboarding_url"
    readonly 39975: "enable_1on1_call_transfer_switchable"
    readonly 39980: "wa_web_calling_notifications_mute_duration_enabled"
    readonly 39981: "web_voip_icce_bubble_voice_and_video_enabled"
    readonly 39990: "vod_vsr_canvas_height"
    readonly 39991: "vod_vsr_canvas_width"
    readonly 39992: "vod_vsr_precision"
    readonly 39993: "vod_sharpen_filter_spec"
    readonly 40006: "web_sender_key_rotation_fix_enabled"
    readonly 40007: "web_status_sender_key_rotation_enabled"
    readonly 40041: "web_contacts_and_groups_enabled"
    readonly 40044: "history_sync_recent_conversations_on_demand_companion"
    readonly 40054: "web_inbox_mentions_replies_filter"
    readonly 40064: "web_new_group_smart_suggestions_enabled"
    readonly 40079: "wa_web_smb_aura_benefits_enabled"
    readonly 40080: "wa_web_smb_pin_sync_keep_pins_enabled"
    readonly 40108: "group_history_cta_stored_window_enabled"
    readonly 40134: "ai_hatch_cvm_enabled"
    readonly 40145: "ai_hatch_in_app_additional_tokens_enabled"
    readonly 40159: "chat_psa_normal_blocklist_enabled"
    readonly 40162: "biz_ai_agent_chat_media_upload_count_limit"
    readonly 40190: "sound_stickers_channels_send_enabled"
    readonly 40194: "aura_premium_sticker_freemium_enabled"
    readonly 40223: "integrity_drop_receipt_enabled"
    readonly 40230: "mex_group_get_group_info_by_add_request"
    readonly 40234: "ai_meta_ai_thread_sync_enabled"
    readonly 40245: "upr_payments_deep_link"
    readonly 40250: "in_p2m_payments_deep_link"
    readonly 40251: "br_p2m_payments_deep_link"
    readonly 40264: "smb_business_broadcast_pro_enabled_with_exposure"
    readonly 40268: "falco_canonical_field_values_to_ignore"
    readonly 40279: "wa_web_calling_frequently_contacted_enabled"
    readonly 40287: "web_usync_privacy_hints"
    readonly 40291: "aura_premium_sticker_regular_sheet_enabled"
    readonly 40293: "ai_hatch_approval_history_enabled"
    readonly 40297: "wa_web_screen_share_receiver_zoom_enabled"
    readonly 40303: "biz_ai_agent_chat_a2ui_enabled"
    readonly 40331: "wa_web_start_chat_context_ui_enabled"
    readonly 40332: "wa_web_start_chat_context_enabled"
    readonly 40347: "md_omitted_conversation_metadata_enabled"
    readonly 40348: "big_screen_drag_and_drop_chat_improvements_enabled"
    readonly 40360: "music_on_chats_lyrics_word_by_word_offsets_enabled"
    readonly 40365: "community_permissions_join_request_enabled"
    readonly 40368: "orders_deprecation_exposure"
    readonly 40383: "ai_hatch_in_app_activation_flow_type"
    readonly 40423: "win_hybrid_push_task_all_banners_enabled"
    readonly 40429: "br_api_offers_text_detection_cta_enabled"
    readonly 40436: "ai_hatch_peer_pairing_card_enabled"
    readonly 40437: "a2ui_fallback_show_timestamp"
    readonly 40460: "web_contacts_and_groups_online_now_enabled"
    readonly 40469: "web_promote_group_actions_to_admins"
    readonly 40472: "web_uplevel_pending_join_requests"
    readonly 40473: "win_hybrid_background_run_records_enabled"
    readonly 40482: "payment_links_psp_logo_allowlist"
    readonly 40486: "web_anr_native_app_state_async_reads_enabled"
    readonly 40487: "web_anr_batch_profile_picture_updates_enabled"
    readonly 40488: "web_anr_cache_media_file_exists_enabled"
    readonly 40489: "web_anr_voip_bridge_json_events_enabled"
    readonly 40490: "web_anr_batch_voip_pn_jid_bridge_operations"
    readonly 40491: "web_anr_batch_close_notification_bridge_operations"
    readonly 40492: "web_anr_hybrid_bridge_json_events_enabled"
    readonly 40493: "web_voip_set_self_country_code_enabled"
    readonly 40494: "web_aura_ringtones_windows_cache_enabled"
    readonly 40495: "win_hybrid_bridge_work_off_ui_thread_enabled"
    readonly 40496: "web_anr_app_launch_skew_rtt_guard_enabled"
    readonly 40531: "win_hybrid_renderer_failure_max_reloads"
    readonly 40532: "username_peer_learning_gate_killswitch"
    readonly 40534: "ai_hatch_subscription_iac_kill_switch"
    readonly 40535: "voip_enable_1to1_accepted_elsewhere_call_log_update"
    readonly 40575: "wa_msg_tctoken_receive_enabled"
    readonly 40581: "wa_web_quick_reaction_in_context_menu"
    readonly 40587: "calling_abprop_bucket_codes"
    readonly 40592: "aura_original_quality_image_quality"
    readonly 40602: "www_native_ads_xplatform_drafts_dummy_enabled"
    readonly 40603: "www_native_ads_xplatform_drafts_enabled"
    readonly 40613: "web_group_info_v2"
    readonly 40619: "wa_web_draft_ad_business_home_card_enabled"
    readonly 40620: "wa_web_draft_ad_business_home_card_dummy"
    readonly 40623: "web_voip_audio_pipeline_v2"
    readonly 40644: "wa_web_meta_one_biz_ai_additional_entry_points_enabled"
    readonly 40647: "web_status_skip_failed_primary_skdm_enabled"
    readonly 40650: "win_hybrid_startup_telemetry_level"
    readonly 40655: "win_hybrid_multi_account_enabled"
    readonly 40656: "web_employee_slash_commands_enabled"
    readonly 40686: "ai_hatch_3p_bot_channel_enabled"
    readonly 40689: "web_status_load_timer_pause_on_bg_enabled"
    readonly 40699: "smb_business_broadcast_pro_smart_audiences_enabled"
    readonly 40735: "call_setup_definition_fix"
    readonly 40762: "acs_graphql_issuance_projects"
    readonly 40769: "web_edit_group_permissions_inline_in_modal"
    readonly 40773: "status_notify_broadcast_addressing_enabled"
    readonly 40787: "av1_video_dual_upload_chat_bitrate_multiplier"
    readonly 40795: "ks_zip_archive_check_enabled"
    readonly 40820: "enhanced_mention_suggestions_restrict_add_tap_target"
    readonly 40846: "enable_vsr_stats"
    readonly 40882: "payments_upr_confirm_reminder_delay_minutes"
    readonly 40893: "smb_business_broadcast_pro_scheduled_sends_enabled"
    readonly 40896: "smb_web_customer_manager_nux_debug_tools_enabled"
    readonly 40908: "web_mex_contact_discovery_bulk_import_enabled"
    readonly 40909: "web_mex_contact_discovery_enabled"
    readonly 40910: "web_mex_contacts_delta_sync_enabled"
    readonly 40911: "br_consumer_promotions_in_purchase_hub_enabled"
    readonly 40953: "web_status_drag_and_drop_enabled"
    readonly 40962: "channels_quick_share_to_status_ui_enabled"
    readonly 40965: "aura_original_quality_media_kill_switch"
    readonly 40976: "wa_web_smb_meta_one_mobile_signup_enabled"
    readonly 40979: "username_pn_contact_info_display"
    readonly 40987: "web_voip_skip_post_handoff_fieldstats_cleanup"
    readonly 40988: "web_syncd_individual_mutation_index_lookup"
    readonly 41048: "ai_hatch_cvm_pin_collection_on_companions_enabled"
    readonly 41056: "wa_web_not_receiving_notifications_banner_enabled"
    readonly 41059: "biz_message_tap_logging_enabled"
    readonly 41066: "br_payments_multiple_pix_codes_in_message_detection_enabled"
    readonly 41067: "web_landing_page_group_button"
    readonly 41077: "channel_chats_list_dim_muted_enabled"
    readonly 41080: "wa_web_hd_download_nux_enabled"
    readonly 41087: "web_album_group_cancel_retry_enabled"
    readonly 41093: "sticker_suggestion_enabled"
    readonly 41095: "web_employee_commands_zero_click_enabled"
    readonly 41098: "web_giphy_sticker_search_enabled"
    readonly 41114: "biz_message_tap_logging_unstructured_enabled"
    readonly 41116: "web_status_bad_ux_logging_parity_enabled"
    readonly 41126: "aura_profile_name_badge_enabled"
    readonly 41127: "aura_profile_name_badge_force_for_all"
    readonly 41129: "wa_web_show_av1_video"
    readonly 41132: "payments_upr_confirmation_receive_enabled"
    readonly 41139: "whats_happening_emoji_only_creation_enabled"
    readonly 41173: "username_pn_sharing_ui_settings_enabled"
    readonly 41174: "ai_hatch_hitl_approval_in_notification_enable"
    readonly 41190: "web_voip_main_thread_lock_fixes"
    readonly 41191: "web_voip_missing_device_audio_fallback_mode"
    readonly 41199: "smb_business_broadcast_pro_duplicate_enabled"
    readonly 41210: "biz_vpv_coverage_logging_enabled"
    readonly 41216: "aura_profile_name_badge_benefit_active"
    readonly 41248: "web_encryption_page_visit_logging"
    readonly 41285: "web_chat_list_bold_title_and_sender"
    readonly 41300: "web_voip_deferred_boot_recent_caller_eager_days"
    readonly 41304: "username_pn_sharing_enabled"
    readonly 41329: "web_album_star_as_one_message_enabled"
    readonly 41354: "web_voip_init_reliability_level"
    readonly 41356: "wag_voice_messages_sandbox_killswitch"
    readonly 41378: "ks_audio_claimed_type_validation_enabled"
    readonly 41387: "web_vc_css_bg_scan_children_first"
    readonly 41391: "payments_upr_bubble_layout_v2_enabled"
    readonly 41400: "web_invite_options_in_add_members_variant"
    readonly 41405: "web_employee_thanks_recipient_lookup_enabled"
    readonly 41411: "win_hybrid_native_bridge_tracing_enabled"
    readonly 41412: "win_hybrid_native_bridge_telemetry_enabled"
    readonly 41423: "sound_stickers_audio_loop_count"
    readonly 41426: "instants_receiver_enabled"
    readonly 41430: "username_pn_sharing_companion_enabled"
    readonly 41447: "smb_qp_bb_chat_list_banner_no_dismiss_cap"
    readonly 41467: "web_bbo_enable_appointment_message"
    readonly 41493: "waweb_status_close_friends_poster_side_enabled"
    readonly 41509: "web_sw_notification_click_raise_open_tab"
    readonly 41510: "web_sw_notification_click_logging_enabled"
    readonly 41517: "enable_thubms_up_for_auth_utility"
    readonly 41522: "ai_hatch_in_app_cvm_activation_enabled"
    readonly 41560: "web_new_group_ux_improvement_enabled"
    readonly 41562: "win_hybrid_post_update_preload"
    readonly 41599: "br_smb_payments_insights_enabled"
    readonly 41601: "wa_web_status_viewer_refresh_level"
    readonly 41605: "wa_web_calling_post_call_notifications_upsell_enabled"
    readonly 41608: "wa_native_ads_web_advertise_subcontent_dummy_variant"
    readonly 41609: "wa_native_ads_web_advertise_subcontent_variant"
    readonly 41620: "wa_web_status_composer_quick_replies_enabled"
    readonly 41634: "forward_reach_score_send_enabled"
    readonly 41635: "forward_reach_stats_logging_enabled"
    readonly 41636: "forward_reach_stats_daily_bucket_cap"
    readonly 41646: "group_membership_form_gem_enabled"
    readonly 41649: "system_provenance_destinations"
    readonly 41650: "legacy_provenance_detection_disabled"
    readonly 41651: "anti_stripping_detection_enabled"
    readonly 41664: "username_pn_sharing_receiver_enabled"
    readonly 41700: "vod_vsr_num_setup_retries"
    readonly 41701: "vod_vsr_retry_interval_s"
    readonly 41705: "payments_receipt_and_state_hide_bubble_add_receipt"
    readonly 41745: "payments_receipt_and_state_bubble_version"
    readonly 41753: "aura_profile_name_badge_kill_switch"
    readonly 41772: "web_empty_group_creation_enabled"
    readonly 41785: "poll_enable_static_add_option_msg"
    readonly 41796: "vod_vsr_model_load_queue_priority"
    readonly 41803: "br_consumer_promotions_in_purchase_hub_variant"
    readonly 41822: "web_voip_incoming_stanza_from_heap"
    readonly 41828: "poll_failure_recovery_version"
    readonly 41877: "web_syncd_batched_orphan_apply"
    readonly 41879: "username_pn_sharing_common_group_count"
    readonly 41923: "ai_hatch_in_app_activation_with_subscription_enabled"
    readonly 41936: "system_provenance_allowed_fields"
    readonly 41938: "win_hybrid_add_call_participants_async_lookup_enabled"
    readonly 41939: "win_hybrid_voip_perf_sampling_off_ui_enabled"
    readonly 41940: "win_hybrid_media_file_prep_off_ui_enabled"
    readonly 41941: "win_hybrid_extension_folder_prep_off_ui_enabled"
    readonly 41950: "status_session_split_scoped_recovery_enabled"
    readonly 41953: "wa_web_companion_discovery_upsell_enabled"
    readonly 41954: "web_ptt_browser_permission_button"
    readonly 41955: "web_photo_capture_browser_permission_button"
    readonly 41968: "win_hybrid_webview_lifecycle_skip_redundant_calls_enabled"
    readonly 41969: "win_hybrid_contacts_invalidate_off_ui_enabled"
    readonly 41970: "win_hybrid_contacts_invalid_chunked_commit_enabled"
    readonly 41971: "win_hybrid_profile_pictures_chunked_commit_enabled"
    readonly 41972: "win_hybrid_native_to_web_events_via_ui_enabled"
    readonly 41973: "win_hybrid_crash_snapshot_off_caller_enabled"
    readonly 41974: "win_hybrid_log_upload_async_io_enabled"
    readonly 41975: "win_hybrid_memory_reporter_toolhelp_enabled"
    readonly 41995: "ctwa_conversion_creation_skip_agm"
    readonly 41999: "ai_content_inspection_url_enabled"
    readonly 42002: "web_gif_search_preview_commit_enabled"
    readonly 42003: "web_gif_search_compact_preview_enabled"
    readonly 42018: "win_hybrid_log_writer_thread_enabled"
    readonly 42021: "aura_original_quality_media_tooltips_enabled"
    readonly 42065: "username_pn_sharing_fetch_cooldown_sec"
    readonly 42069: "companion_prechatd_pairing_progress_ui_enabled"
    readonly 42073: "companion_critical_sync_progress_ui_enabled"
    readonly 42129: "wa_web_reply_with_selected_text"
    readonly 42143: "ai_hatch_group_history_share_enabled"
    readonly 42155: "web_employee_commands_prod_enabled"
    readonly 42168: "biz_ai_web_sc_failure_cache_enabled"
    readonly 42177: "meta_one_smb_focus_schedules_enabled"
    readonly 42190: "web_filtered_contacts_coalesce_recompute"
    readonly 42199: "android_instants_video_enabled"
    readonly 42203: "sticker_suggestion_emoji_group_update_enabled"
    readonly 42209: "channels_questions_replies_adjusted_layout_enabled"
    readonly 42214: "wa_web_voice_note_transcript_enabled"
    readonly 42234: "aura_original_quality_media_share_extension_enabled"
    readonly 42239: "aura_pinned_chats_hidden_pins_fix_enabled"
    readonly 42240: "aura_pinned_chats_trim_requires_synced_benefits_enabled"
    readonly 42241: "wa_subscription_resync_after_missing_active_seconds"
    readonly 42259: "win_hybrid_watchdog_normal_priority_ping_relay_enabled"
    readonly 42261: "wa_web_reply_with_selected_text_version"
    readonly 42263: "channels_post_status_card_web_enabled"
    readonly 42264: "web_group_members_view_enabled"
    readonly 42273: "aura_premium_sticker_freemium_reset_days"
    readonly 42276: "sound_stickers_giphy_clips_enabled"
    readonly 42284: "wa_web_status_playable_before_thumbnail"
    readonly 42286: "ai_hatch_cvm_settings_enabled"
    readonly 42287: "wa_web_status_list_prefetch"
    readonly 42288: "wa_web_status_list_prefetch_depth"
    readonly 42292: "wa_web_status_progressive_decrypt"
    readonly 42296: "aura_profile_name_badge_testing_about"
    readonly 42321: "ai_rich_response_inline_media_side_by_side_survey_enabled"
    readonly 42322: "ai_rich_response_side_by_side_survey_skip_enabled"
    readonly 42323: "aura_original_quality_media_share_send_enabled"
    readonly 42348: "wabai_thread_sync_fixes_enabled"
    readonly 42390: "wa_web_companion_logout_reminder_days"
    readonly 42391: "ai_hatch_cvm_activation_pairing_window_ttl"
    readonly 42406: "call_spam_prompt_logging_enabled"
    readonly 42407: "call_spam_prompt_session_id_enabled"
    readonly 42420: "support_wass_chat_auth_refresh_enabled"
    readonly 42424: "web_group_status_posting_enabled"
    readonly 42442: "aura_group_reactions_server_field_enabled"
    readonly 42448: "win_hybrid_efficiency_mode_opt_out_enabled"
    readonly 42497: "username_pn_sharing_sender_companion_enabled"
    readonly 42503: "biz_ai_web_checkout_enabled"
    readonly 42509: "username_pn_sharing_history_sync_enabled"
    readonly 42517: "meta_one_biz_ai_power_user_upsell"
    readonly 42553: "smb_lists_list_details_open_chat_enabled"
    readonly 42567: "meta_one_smb_original_media_enabled"
    readonly 42578: "aura_native_benefit_previews_bottom_button_variant"
    readonly 42584: "live_location_companion_viewing_enabled"
    readonly 42591: "ai_hatch_connectors_new_ui_enabled"
    readonly 42615: "web_socket_handshake_timeout_enabled"
    readonly 42618: "rust_sandbox_enable_libwebp"
    readonly 42627: "channels_post_status_video_card_web_enabled"
    readonly 42631: "web_employee_thanks_prod_enabled"
    readonly 42640: "web_socket_handshake_timeout_seconds"
    readonly 42641: "ks_claimed_type_validation_enabled"
    readonly 42646: "web_contact_db_broadcast_rows_cleanup_enabled"
    readonly 42650: "companion_pairing_progress_ui_enabled_prechatd"
    readonly 42665: "web_calling_in_call_chat_enabled"
    readonly 42667: "web_voip_audio_shared_call_context"
    readonly 42680: "win_hybrid_contact_activities_enabled"
    readonly 42682: "companion_passkey_pairing_enabled"
    readonly 42703: "aura_static_benefit_rows_enabled"
    readonly 42715: "business_broadcast_mv_credits_expired_days"
    readonly 42721: "smb_business_broadcast_pro_account_insights_enabled"
    readonly 42722: "guest_calling_discoverability_awareness"
    readonly 42726: "web_voip_camera_and_microphone_permission_button"
    readonly 42731: "web_product_list_identity_mode"
    readonly 42751: "web_voip_background_blur"
    readonly 42753: "ai_group_muse_soak_enabled"
    readonly 42759: "web_db_upgrade_from_stored_version"
    readonly 42769: "ptv_forwarding_to_status_enabled"
    readonly 42779: "wa_web_status_hover_prefetch"
    readonly 42780: "wa_web_status_unread_dot_prefetch"
    readonly 42797: "wa_subscriptions_unified_api_enabled"
    readonly 42816: "wa_web_status_hover_prefetch_dwell_ms"
    readonly 42817: "status_web_vpv_impression_snapshot_fix_enabled"
    readonly 42884: "wa_contact_manager_meta_one_rollout_enabled"
    readonly 42895: "enable_web_voip_webtransport_until_accept"
    readonly 42960: "syncd_no_retry_on_resource_limit_enabled"
    readonly 42965: "wa_web_status_video_recovery"
    readonly 42973: "poll_option_replay_retention_days"
    readonly 42975: "events_v2_invite_message_self_state_enabled"
    readonly 42988: "web_chat_cell_skip_content_visibility"
    readonly 43013: "ctwa_web_budgeting_na_zo_model_arm"
    readonly 43014: "ctwa_web_budgeting_na_zo_model_dummy_arm"
    readonly 43023: "enable_events_v2_companion_features"
    readonly 43065: "web_voip_video_effects"
    readonly 43066: "web_voip_video_effects_entry_points"
    readonly 43108: "ai_group_muse_enabled"
    readonly 43114: "ai_pdfn_nux_ai_group_muse_member_notice_id"
    readonly 43168: "guest_calling_discoverability_invite_flows"
    readonly 43192: "channels_forward_to_my_status_web_enabled"
    readonly 43199: "music_on_chats_catalog_promo_banner_enabled"
    readonly 43200: "web_group_status_own_unread_ring_enabled"
    readonly 43201: "web_group_status_attribution_contact_info_enabled"
    readonly 43202: "web_group_status_reply_privately_enabled"
    readonly 43203: "web_group_status_floating_like_heads_enabled"
    readonly 43204: "web_group_status_floating_like_heads_dismiss_enabled"
    readonly 43224: "web_admin_hub"
    readonly 43226: "win_hybrid_bg_task_class_mta_registration_enabled"
    readonly 43254: "ctwa_smb_h2_2026_ofs_migration_dummy_enabled"
    readonly 43258: "system_provenance_allowed_values"
    readonly 43273: "web_offline_resume_primary_snapshot_enabled"
    readonly 43274: "md_logout_trigger_enabled"
    readonly 43301: "biz_integrity_query_lid_enabled"
    readonly 43328: "web_emoji_17"
    readonly 43359: "music_on_chats_clear_storage_row_enabled"
    readonly 43366: "ai_group_muse_add_enabled"
    readonly 43376: "wa_web_status_list_open_prefetch_depth"
    readonly 43405: "payment_links_psp_logo_urls"
    readonly 43448: "ctwa_web_native_ads_status_boost_enabled_dummy"
    readonly 43449: "ctwa_web_native_ads_status_boost_enabled"
    readonly 43484: "wa_web_media_editor_quality_for_all_photos_enabled"
    readonly 43485: "ctwa_conversation_counter_message_types"
    readonly 43576: "smb_web_fb_linking"
}

export declare const WA_GROUP_ABPROPS_BY_CODE: {
    readonly 23245: "group_history_send_group_level"
    readonly 23246: "group_history_settings_toggle_ui_group_level"
    readonly 24037: "wa_web_channels_comet_video_player_enabled"
    readonly 25322: "web_test_use_case_client_group"
    readonly 27009: "poll_end_time_enabled_group_level"
    readonly 27025: "poll_hide_voters_enabled_group_level"
    readonly 28357: "poll_add_option_enabled_group_level"
    readonly 28358: "poll_creator_edit_enabled_group_level"
    readonly 30590: "rt_ghs_sender_group_level_enabled"
    readonly 30905: "group_history_send_after_join_group_level"
    readonly 30906: "group_history_setting_decouple_enabled_group_level"
    readonly 32501: "ai_group_tee_history_share_group_level_enabled"
    readonly 35639: "group_settings_ia_group_level"
    readonly 35772: "poll_add_option_creator_enabled_group_level"
    readonly 36505: "group_history_send_admin_set_default_on_group_level"
    readonly 38082: "pinned_messages_remove_30_day_pins_group_level"
    readonly 38083: "pinned_messages_infinite_sender_group_level_enabled"
}

// Props the runtime permits reading before the config cache has resolved.
// Reading anything else that early logs a warning and yields the default.
export declare const WA_ABPROPS_USED_BEFORE_INIT: readonly ["community_admin_promotion_one_time_prompt", "direct_connection_business_numbers", "disable_auto_download", "external_ctx_url_param_names", "falco_md_id_fix_web_enabled", "in_app_support_v2_number_prefixes", "parent_group_view_enabled", "wa_web_console_log_level", "wa_web_drag_and_drop_capabilities", "wa_web_pre_chat_device_id_test", "wds_radius_and_casing", "web_abprop_core_wam_runtime", "web_abprop_screen_lock_enabled", "web_design_refresh", "web_disable_logs_low_end_device", "web_enable_profile_pic_thumb_db_caching", "web_image_max_edge", "web_low_end_device_level", "web_material_refresh", "web_native_fetch_media_download", "web_offline_resume_qpl_enabled", "web_socket_handshake_timeout_enabled", "web_socket_handshake_timeout_seconds", "web_socket_parallel_connection_enabled", "web_store_quota_manager_enabled", "web_vc_css_bg_scan_children_first"]

// Props mirrored into localStorage (as a JSON object under `localStorageKey`)
// so startup code can consult them before the IndexedDB store opens.
export declare const WA_ABPROPS_SPECIAL_EARLY: {
    readonly localStorageKey: "abprops_needed_early"
    readonly props: readonly ["wa_web_favicons_update_m1", "web_ui_refresh_m1", "web_hybrid_apply_latest_db_schema_optimization_enabled"]
}

export type WaAbPropName = keyof typeof WA_ABPROPS
export type WaGroupAbPropName = keyof typeof WA_GROUP_ABPROPS

// --- Derived helpers ------------------------------------------------------

// Resolve a prop's decoded JS value type from its declared wire type.
export type WaAbPropValueOf<P> =
    P extends { type: 'bool' }
        ? boolean
        : P extends { type: 'int' | 'float' }
          ? number
          : P extends { type: 'string' }
            ? string
            : never

// Value type for a prop looked up by name — e.g.
// `WaAbPropValueByName<'web_image_max_edge'>` resolves to `number`.
export type WaAbPropValueByName<K extends WaAbPropName> = WaAbPropValueOf<(typeof WA_ABPROPS)[K]>

export type WaGroupAbPropValueByName<K extends WaGroupAbPropName> = WaAbPropValueOf<
    (typeof WA_GROUP_ABPROPS)[K]
>
