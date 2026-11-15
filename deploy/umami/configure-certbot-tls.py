#!/usr/bin/env python3
"""Apply a Certbot-only TLS group policy for the host's ACME connection."""
from pathlib import Path
import subprocess

source = Path('/etc/ssl/openssl.cnf').read_text()
if '[openssl_init]' not in source:
    raise SystemExit('Unexpected system OpenSSL configuration; inspect manually')
source = source.replace('[openssl_init]', '[openssl_init]\nssl_conf = kt_certbot_ssl', 1)
source += '\n[kt_certbot_ssl]\nsystem_default = kt_certbot_tls\n\n[kt_certbot_tls]\nGroups = X25519:prime256v1:secp384r1\n'
target = Path('/etc/letsencrypt/openssl-certbot.cnf')
if target.exists() and target.read_text() != source:
    raise SystemExit('Existing Certbot OpenSSL config differs; inspect before replacing')
target.write_text(source)
target.chmod(0o644)
directory = Path('/etc/systemd/system/certbot.service.d')
directory.mkdir(exist_ok=True)
override = directory / 'tls-compatibility.conf'
value = '[Service]\nEnvironment=OPENSSL_CONF=/etc/letsencrypt/openssl-certbot.cnf\n'
if override.exists() and override.read_text() != value:
    raise SystemExit('Existing Certbot override differs; inspect before replacing')
override.write_text(value)
override.chmod(0o644)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
print('Certbot TLS policy installed; system-wide TLS configuration unchanged.')
