export const WA_ABPROPS_PROTOCOL_VERSION = '1'
export const WA_ABPROPS_REFRESH_BOUNDS = Object.freeze({
    MIN_S: 600,
    MAX_S: 604_800,
    DEFAULT_S: 86_400
} as const)

export type AbPropType = 'bool' | 'int' | 'string'
export type AbPropValue = boolean | number | string

export interface AbPropConfigEntry {
    readonly configCode: number
    readonly type: AbPropType
    readonly defaultValue: AbPropValue
}

function prop(configCode: number, type: AbPropType, defaultValue: AbPropValue): AbPropConfigEntry {
    return { configCode, type, defaultValue }
}

export const AB_PROP_CONFIGS = Object.freeze({
    // --- app state sync (syncd) ---
    syncd_key_max_use_days: prop(5498, 'int', 90),
    syncd_wait_for_key_timeout_days: prop(5499, 'int', 30),
    syncd_sentinel_timeout_seconds: prop(5500, 'int', 60),
    syncd_inline_mutations_max_count: prop(5501, 'int', 1_000),
    syncd_patch_protobuf_max_size: prop(5502, 'int', 1_048_576),
    syncd_additional_mutations_count: prop(2777, 'int', 1),
    syncd_periodic_sync_days: prop(1400, 'int', 0),
    syncd_mutation_and_bundle_logging: prop(11821, 'string', '{"allowlist": []}'),
    wa_web_enable_syncd_key_persistence_only_after_server_ack: prop(27069, 'bool', false),
    web_request_missing_keys_for_removes: prop(11695, 'bool', false),
    web_syncd_max_mutations_to_process_during_resume: prop(15808, 'int', 10_000),
    web_syncd_fatal_fields_from_L1104589PRV2: prop(1808, 'bool', false),
    web_enable_improved_bulk_merge: prop(19854, 'bool', false),
    snapshot_recovery_max_mutations_count_allowed: prop(18786, 'int', 2_000),
    md_syncd_logging_spec_enabled: prop(14499, 'bool', false),
    kmp_syncd_engine_crypto_enabled: prop(15909, 'bool', false),
    enable_syncd_debug_data_in_patch: prop(6614, 'bool', false),
    enable_mention_everyone_syncd_sender: prop(24244, 'bool', false),
    username_contact_syncd_support_enable: prop(17614, 'bool', false),

    // --- message sending / encryption ---
    after_read_sending_enabled: prop(7293, 'bool', false),
    after_read_fallback_duration: prop(7294, 'int', 86_400),
    after_read_receiver_enabled: prop(7295, 'bool', false),
    privacy_token_sending_on_all_1_on_1_messages: prop(9281, 'bool', false),
    flows_termination_message_v2_sending_enabled: prop(9157, 'bool', false),
    dm_initiator_trigger_groups: prop(7141, 'bool', false),
    placeholder_message_resend_maximum_days_limit: prop(3639, 'int', 14),
    message_edit_to_message_secret_sender_enabled: prop(16057, 'bool', false),
    message_edit_to_message_secret_receiver_enabled: prop(17811, 'bool', false),
    top_level_message_secret_check: prop(23796, 'bool', false),
    parse_encrypted_dsm_msg_fix: prop(26772, 'bool', false),
    rt_sender_dual_encrypted_msg_enabled: prop(12623, 'bool', true),
    rt_receiver_dual_encrypted_msg_enabled: prop(15258, 'bool', true),
    lid_one_to_one_migration_event_response_force_pn_jid: prop(15791, 'bool', false),
    web_anr_async_msg_send_handler: prop(27249, 'bool', false),
    message_keys_async_chunk_size: prop(22815, 'int', 50),
    synced_message_keys_processing_type: prop(22825, 'string', 'control'),
    limit_sharing_protocol_message_receiver_enabled: prop(15129, 'bool', false),
    web_pnless_stanzas: prop(26211, 'bool', false),

    // --- NCT tokens ---
    wa_nct_token_send_enabled: prop(24941, 'bool', false),
    wa_nct_token_syncd_enabled: prop(25253, 'bool', false),
    wa_nct_token_history_sync_enabled: prop(25189, 'bool', false),

    // --- group ---
    group_size_limit: prop(3596, 'int', 1_024),
    group_max_subject: prop(3597, 'int', 100),
    group_description_length: prop(3598, 'int', 2_048),
    anyone_can_link_to_groups: prop(3978, 'bool', false),
    group_call_max_participants: prop(4190, 'int', 32),
    group_history_receive: prop(15311, 'bool', false),
    group_history_send: prop(15313, 'bool', false),
    group_history_settings: prop(21261, 'bool', false),
    group_history_settings_query: prop(22230, 'bool', false),
    group_history_message_count_limit: prop(18405, 'int', 100),
    group_history_message_count_receiver_upper_limit: prop(19811, 'int', 100),
    group_history_messages_time_limit_receiver_enforcement_secs: prop(21313, 'int', 1_209_600),
    group_history_bundle_time_limit_receiver_enforcement_secs: prop(25910, 'int', 1_209_600),
    group_history_notice_receive: prop(15722, 'bool', false),
    group_history_out_of_window_pin_sender: prop(26037, 'bool', false),
    group_history_out_of_window_pins_receiver: prop(26039, 'bool', false),
    group_history_reporting: prop(22329, 'bool', true),
    group_create_add_using_lid_jids: prop(16192, 'bool', false),
    group_member_updates_hide_in_thread_enabled: prop(24584, 'bool', false),
    group_status_receiver_enabled: prop(13956, 'bool', false),
    web_send_invisible_msg_max_group_size: prop(13289, 'int', 256),
    web_send_invisible_msg_min_group_size: prop(13290, 'int', 50),
    admin_only_mention_everyone_group_size: prop(18500, 'int', 0),

    // --- history sync ---
    web_abprop_drop_full_history_sync: prop(13034, 'bool', false),
    wa_web_history_sync_dynamic_throttling: prop(14178, 'bool', false),
    web_e2e_backfill_expire_time: prop(11244, 'int', 0),
    history_sync_on_demand: prop(3337, 'bool', false),
    history_sync_on_demand_message_count: prop(3811, 'int', 50),
    history_sync_on_demand_failure_limit: prop(4364, 'int', 10),
    history_sync_on_demand_cooldown_sec: prop(4365, 'int', 7_200),
    history_sync_on_demand_complete_companion: prop(21024, 'bool', false),
    history_sync_on_demand_with_android_beta: prop(4135, 'bool', false),
    web_anr_throttle_history_sync_db_writes: prop(19298, 'bool', false),
    web_force_lid_chats_in_history: prop(24343, 'bool', false),
    web_history_sync_allow_duplicate_in_bulk_error: prop(10842, 'bool', false),

    // --- media ---
    default_media_limit_mb: prop(1290, 'int', 100),
    web_image_max_edge: prop(10371, 'int', 1_600),
    web_image_max_hd_edge: prop(3204, 'int', 2_560),
    web_channel_video_server_transcode_upload: prop(19920, 'bool', false),
    web_deprecate_mms4_hash_based_download: prop(3152, 'bool', false),
    kaleidoscope_thumbnail_validation: prop(18114, 'bool', true),
    web_use_kaleidoscope_media_check_enabled: prop(20375, 'bool', false),
    low_cache_hit_rate_media_types: prop(4836, 'string', 'ptt,audio,document,ppic'),
    web_anr_async_media_decryption_enabled: prop(23200, 'bool', false),
    web_anr_media_chunk_enc_delay_enabled: prop(22931, 'bool', false),
    web_media_compute_in_worker_enabled: prop(25641, 'bool', false),

    // --- device management / auth ---
    adv_accept_hosted_devices: prop(6939, 'bool', true),
    num_days_key_index_list_expiration: prop(730, 'int', 35),
    num_days_before_device_expiry_check: prop(731, 'int', 7),
    web_adv_logout_on_self_device_list_expired: prop(11011, 'bool', false),
    md_icdc_hash_length: prop(310, 'int', 10),
    noise_pq_mode: prop(20161, 'int', 0),

    // --- trusted contacts / privacy tokens ---
    tctoken_num_buckets: prop(909, 'int', 4),
    tctoken_num_buckets_sender: prop(997, 'int', 4),
    tctoken_duration_sender: prop(996, 'int', 604_800),

    // --- connection / offline ---
    heartbeat_interval_s: prop(1430, 'int', 5),
    web_offline_message_processor_timeout_seconds: prop(12834, 'int', 15),
    web_offline_resume_wait_for_ping_response_enabled: prop(14567, 'bool', false),
    web_offline_resume_wait_for_ping_timeout_seconds: prop(14568, 'int', 5),
    web_comms_socket_reconnect_enabled: prop(7854, 'bool', false),

    // --- receipts ---
    web_resume_optimized_read_receipt_send_interval: prop(13978, 'int', 3_000),
    web_reaction_inactive_receipt: prop(25954, 'bool', false),
    lid_status_non_soaked_client_support_enabled: prop(19696, 'bool', true),

    // --- signal protocol ---
    s567418_local_keys_strict_validation: prop(23899, 'bool', true),
    s567418_mitigation_enabled: prop(22029, 'bool', true),
    web_signal_future_messages_max: prop(12509, 'int', 20_000),

    // --- polls ---
    poll_add_option_enabled: prop(24517, 'bool', false),
    poll_add_option_receiving_enabled: prop(25758, 'int', 0),
    poll_creator_edit_enabled: prop(24887, 'bool', false),
    poll_creator_edit_receiving_version: prop(24886, 'int', 0),
    poll_end_time_enabled: prop(24405, 'bool', false),
    poll_end_time_receiving_enabled: prop(24884, 'bool', false),
    poll_hide_voters_enabled: prop(24518, 'bool', false),
    poll_hide_voters_receiving_enabled: prop(24885, 'int', 0),

    // --- status / ephemeral ---
    text_status_ttl_seconds_allowlist: prop(6153, 'string', '1800,3600,7200,14400,28800,86400'),

    // --- username ---
    username_enabled_on_companion: prop(23817, 'bool', false),
    username_max_length: prop(20459, 'int', 35),
    username_min_length: prop(20494, 'int', 3),

    // --- message capping ---
    wa_individual_new_chat_msg_capping_enabled: prop(20865, 'bool', true),
    wa_individual_new_chat_msg_capping_limit: prop(17845, 'int', 0),
    wa_individual_new_chat_msg_capping_fetch_ttl_seconds: prop(20649, 'int', 3_600),

    // --- calling ---
    enable_web_calling: prop(15461, 'bool', false),
    calling_lid_version: prop(3358, 'int', 0)
} as const satisfies Readonly<Record<string, AbPropConfigEntry>>)

export type AbPropName = keyof typeof AB_PROP_CONFIGS

const CONFIG_CODE_TO_NAME = new Map<number, AbPropName>()
for (const [name, entry] of Object.entries(AB_PROP_CONFIGS)) {
    CONFIG_CODE_TO_NAME.set(entry.configCode, name as AbPropName)
}

export function resolveAbPropNameByCode(configCode: number): AbPropName | undefined {
    return CONFIG_CODE_TO_NAME.get(configCode)
}
