# Hosting on an Oracle Cloud Always Free VM

This puts the page and the API on one small VM with a public address. Elasticsearch runs on the same machine and
listens on localhost only. **Status: the script below has been syntax-checked but has not been run on a real VM.**
Expect to fix small things on the first run.

What you need: an Oracle Cloud account (sign-up asks for a credit card for identity; Always Free resources are not
charged), this repository on GitHub, and a GitHub token with read-only access to public repositories.

## 1. Create the VM (Oracle Cloud console)

1. Compute > Instances > Create instance.
2. Image: **Ubuntu 24.04**. Shape: **VM.Standard.A1.Flex** (Ampere), 2 OCPU and 12 GB memory, both within Always Free.
   If the console reports "out of capacity", try another availability domain or try again later.
3. Networking: keep "Assign a public IPv4 address" on.
4. SSH keys: let the console generate a key pair and download the private key.
5. Create. Note the public IP address.

## 2. Open port 80 in the cloud firewall

Networking > Virtual cloud networks > your VCN > Security Lists > Default Security List > Add Ingress Rule:
source CIDR `0.0.0.0/0`, IP protocol TCP, destination port `80`. Leave port 9200 closed; Elasticsearch must never be
reachable from outside.

## 3. Install on the VM

```bash
ssh -i <private-key-file> ubuntu@<public-ip>
git clone https://github.com/<you>/<repo>.git dupbug && cd dupbug
cp .env.example .env
nano .env                      # paste the token after GITHUB_TOKEN=
deploy/setup_vm.sh
```

The script installs Node 22 (checksum verified), creates the Python environment, downloads and verifies
Elasticsearch 8.19.25, downloads the 8,000 issues listed in `manifest/`, builds the index, opens port 80 on the VM's
own firewall and installs two services: `dupbug-es` and `dupbug-api`. It prints the address at the end. Allow about
ten minutes.

## 4. Check

Open `http://<public-ip>/` from another network (for example a phone on mobile data), load a sample and press Search.

```bash
systemctl status dupbug-es dupbug-api      # both should be "active (running)"
journalctl -u dupbug-api -n 50             # API log
sudo systemctl restart dupbug-api          # after pulling new code: git pull && npm ci && restart
```

## What this setup does and does not do

- The API listens on port 80, limits each visitor to 30 searches a minute and sends basic security headers.
- Elasticsearch keeps security disabled, which is acceptable only because it is bound to `127.0.0.1` and port 9200 is
  closed in both firewalls. Do not change either.
- Plain HTTP only, addressed by IP. HTTPS needs a domain name (a free dynamic-DNS name works) and a reverse proxy such
  as Caddy in front of the API; if you add a proxy, set `TRUST_PROXY=1` in the API service so rate limiting sees the
  real visitor address.
- No monitoring, no backups (the index can be rebuilt from the manifest), no automatic updates of the application.
- Oracle may reclaim Always Free instances it considers idle, and it changed the free allowance in 2026. Check the
  current terms when you sign up.
