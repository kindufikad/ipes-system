DELETE FROM blocked_ips WHERE ip_address IN ('127.0.0.1', '::1', '::ffff:127.0.0.1');
