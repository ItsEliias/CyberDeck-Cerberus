"""NetLab module — offline network calculators (subnet/CIDR, port reference). Pure math."""
from __future__ import annotations

import ipaddress

from flask import Blueprint, jsonify, request

bp = Blueprint("netlab", __name__, url_prefix="/api/netlab")

# Common ports quick-reference.
COMMON_PORTS = {
    20: "FTP data", 21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    67: "DHCP", 68: "DHCP", 69: "TFTP", 80: "HTTP", 110: "POP3", 111: "RPCbind",
    123: "NTP", 135: "MSRPC", 139: "NetBIOS", 143: "IMAP", 161: "SNMP", 389: "LDAP",
    443: "HTTPS", 445: "SMB", 465: "SMTPS", 514: "Syslog", 587: "SMTP submission",
    636: "LDAPS", 993: "IMAPS", 995: "POP3S", 1433: "MSSQL", 1521: "Oracle",
    2049: "NFS", 3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL", 5900: "VNC",
    5985: "WinRM", 6379: "Redis", 8080: "HTTP-alt", 8443: "HTTPS-alt", 27017: "MongoDB",
}


@bp.route("/subnet")
def subnet():
    """Subnet/CIDR breakdown. Accepts '10.0.0.0/24' or '10.0.0.5 255.255.255.0'."""
    q = (request.args.get("cidr") or "").strip()
    try:
        if " " in q:
            addr, mask = q.split(None, 1)
            net = ipaddress.ip_network(f"{addr}/{mask}", strict=False)
        else:
            net = ipaddress.ip_network(q, strict=False)
    except ValueError as e:
        return jsonify(error=str(e)), 400

    hosts = list(net.hosts())
    usable = len(hosts)
    return jsonify(
        network=str(net.network_address),
        broadcast=str(getattr(net, "broadcast_address", "")),
        netmask=str(net.netmask),
        wildcard=str(net.hostmask),
        prefix=net.prefixlen,
        version=net.version,
        total_addresses=net.num_addresses,
        usable_hosts=usable,
        first_host=str(hosts[0]) if hosts else None,
        last_host=str(hosts[-1]) if hosts else None,
        is_private=net.is_private,
    )


@bp.route("/ports")
def ports():
    """Port reference. Optional ?q= to filter by number or service name."""
    q = (request.args.get("q") or "").strip().lower()
    rows = [{"port": p, "service": s} for p, s in sorted(COMMON_PORTS.items())]
    if q:
        rows = [r for r in rows if q in str(r["port"]) or q in r["service"].lower()]
    return jsonify(ports=rows)
