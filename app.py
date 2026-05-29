import time, json, threading, platform
import psutil
from flask import Flask, render_template, Response, stream_with_context
from datetime import timedelta

app         = Flask(__name__)
_boot_time  = psutil.boot_time()
_is_windows = platform.system() == "Windows"
_cpu_overall  = 0.0
_cpu_per_core = []

def _sample_cpu():
    global _cpu_overall, _cpu_per_core
    while True:
        _cpu_overall  = psutil.cpu_percent(interval=0.5)
        _cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)

threading.Thread(target=_sample_cpu, daemon=True).start()

def uptime_str():
    delta = timedelta(seconds=int(time.time() - _boot_time))
    h, rem = divmod(int(delta.total_seconds()), 3600)
    m, s   = divmod(rem, 60)
    return f"{h}h {m:02d}m {s:02d}s"

def bytes_to_human(n):
    for u in ["B","KB","MB","GB","TB"]:
        if abs(n) < 1024: return f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} PB"

def build_stats():
    mem  = psutil.virtual_memory()
    freq = psutil.cpu_freq()
    nc   = psutil.cpu_count()

    if _is_windows:
        swap_pct   = 0.0
        swap_used  = "N/A"
        swap_total = "N/A"
    else:
        swap       = psutil.swap_memory()
        swap_pct   = round(swap.percent, 1)
        swap_used  = bytes_to_human(swap.used)
        swap_total = bytes_to_human(swap.total)

    disks = []
    for p in psutil.disk_partitions()[:4]:
        try:
            u = psutil.disk_usage(p.mountpoint)
            disks.append({
                "mount": p.mountpoint,
                "pct":   round(u.percent, 1),
                "used":  bytes_to_human(u.used),
                "total": bytes_to_human(u.total),
            })
        except: pass

    top_procs = []
    for p in psutil.process_iter(["pid","name","cpu_percent","memory_percent","status"]):
        try:
            info  = p.info
            name  = (info.get("name") or "").lower()
            cpu_p = info.get("cpu_percent") or 0.0
            if name in ("idle","system idle process","kernel_task","[idle]"): continue
            if cpu_p == 0.0: continue
            top_procs.append({
                "pid":    info.get("pid"),
                "name":   (info.get("name") or "?")[:20],
                "cpu":    round(cpu_p / nc, 1),
                "mem":    round(info.get("memory_percent") or 0.0, 1),
                "status": info.get("status","?"),
            })
        except: pass
    top_procs = sorted(top_procs, key=lambda x: x["cpu"], reverse=True)[:10]

    return {
        "cpu":            round(_cpu_overall, 1),
        "per_core":       [round(c, 1) for c in _cpu_per_core],
        "cores_logical":  nc,
        "cores_physical": psutil.cpu_count(logical=False),
        "freq_cur":       round(freq.current) if freq else 0,
        "freq_max":       round(freq.max)     if freq else 0,
        "proc_count":     len(list(psutil.process_iter())),
        "mem_pct":        round(mem.percent, 1),
        "mem_used":       bytes_to_human(mem.used),
        "mem_free":       bytes_to_human(mem.available),
        "mem_total":      bytes_to_human(mem.total),
        "swap_pct":       swap_pct,
        "swap_used":      swap_used,
        "swap_total":     swap_total,
        "is_windows":     _is_windows,
        "disks":          disks,
        "procs":          top_procs,
        "uptime":         uptime_str(),
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stream")
def stream():
    def generate():
        while True:
            yield f"data: {json.dumps(build_stats())}\n\n"
            time.sleep(0.5)
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

if __name__ == "__main__":
    import webbrowser
webbrowser.open("http://localhost:5050")
app.run(debug=False, host='0.0.0.0', port=int(os.environ.get('PORT', 5050)))
