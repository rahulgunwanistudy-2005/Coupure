# Physical market box: assembly and verification

Suggested prototype: Raspberry Pi 5 (8 GB recommended for this full regtest stack), SSD, ventilated case, a stable USB-C power source meeting the Pi's power needs, and an access point. A 20,000 mAh power bank is a capacity option, not a measured runtime guarantee; check its USB-C output and actual consumption. A separate access point avoids disrupting the Pi's management connection while configuring Wi-Fi.

1. Install a current 64-bit Raspberry Pi OS and Docker Compose. Use the documented laptop/VPS startup first over Ethernet.
2. Start `make demo`. Confirm the mint, operator page and public board are reachable from another LAN device.
3. Configure the access point with a unique SSID, WPA2/WPA3 password, stable box IP and local DNS for the chosen TLS hostname. Example hostapd and dnsmasq fragments are in `infra/pi/`; they must be adapted to the actual interfaces and networking manager.
4. Follow `DEPLOYMENT.md` for DNS-01 HTTPS before leaving the uplink.
5. Print a sticker with the SSID, Wi-Fi password, exact HTTPS hostname and the mint keyset fingerprint. Verify the fingerprint from a trusted operator device. This release implements first-use keyset pinning, not a camera-based sticker enrollment flow.
6. A captive portal may redirect users to the HTTPS hostname. Never intercept HTTPS or pretend an HTTP captive-check page provides a trusted wallet. The QR/sticker is the reliable launcher if the phone suppresses captive portals on a network without internet.
7. Record the physical cable cut, one T1 purchase, a refused replay and restoration. Check that the phones use Wi-Fi with mobile data disabled.
8. Measure actual power draw, battery life, temperature, restart recovery, phone performance and LAN range. Record hardware model and ambient conditions before publishing numbers.

Do not run the supplied regtest bootstrap against real-money LND nodes. A physical box containing real funds needs proper wallet backups, independently reviewed reserve custody and a separate operational security review.
