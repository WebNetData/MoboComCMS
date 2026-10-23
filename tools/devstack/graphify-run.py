"""Run the installed Graphify interpreter offline and measure process-tree RSS.

The Windows sample is working set, not private bytes or an exact peak between
samples. Native output stays in ignored local artifacts, never agent context.
"""
import ctypes
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from ctypes import wintypes


def windows_rss(root_pid):
    if sys.platform != "win32":
        return None
    class Entry(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                    ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", wintypes.LONG),
                    ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR * 260)]
    class Memory(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
            (x, ctypes.c_size_t) for x in ("PeakWorkingSetSize", "WorkingSetSize",
                "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage",
                "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
    kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Memory), wintypes.DWORD]
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)
    if snapshot == ctypes.c_void_p(-1).value:
        return None
    entry = Entry(); entry.dwSize = ctypes.sizeof(entry)
    parents = {}
    try:
        ok = kernel.Process32FirstW(snapshot, ctypes.byref(entry))
        while ok:
            parents[entry.th32ProcessID] = entry.th32ParentProcessID
            ok = kernel.Process32NextW(snapshot, ctypes.byref(entry))
    finally:
        kernel.CloseHandle(snapshot)
    selected = {root_pid}
    while True:
        more = {pid for pid, parent in parents.items() if parent in selected}
        if more <= selected: break
        selected |= more
    total = 0
    for pid in selected:
        handle = kernel.OpenProcess(0x410, False, pid)
        if not handle: continue
        try:
            memory = Memory(); memory.cb = ctypes.sizeof(memory)
            if psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), memory.cb):
                total += memory.WorkingSetSize
        finally:
            kernel.CloseHandle(handle)
    return total


def main():
    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    env = dict(os.environ)
    # No provider credentials, custom provider endpoint or inherited scan overrides.
    for key in list(env):
        if key.endswith("API_KEY") or key.startswith(("GRAPHIFY_", "OPENAI_", "ANTHROPIC_",
                "GEMINI_", "GOOGLE_", "MOONSHOT_", "DEEPSEEK_", "OLLAMA_", "AWS_")):
            del env[key]
    guard = str(Path(__file__).parent / "graphify-offline")
    env.update(MOBOCOM_GRAPHIFY_OFFLINE="1", PYTHONPATH=guard,
               PYTHONUTF8="1", GRAPHIFY_NO_TIPS="1", GRAPHIFY_MAX_WORKERS="2")
    started = time.perf_counter()
    peak = None; samples = 0
    with open(request["log"], "w", encoding="utf-8") as log:
        child = subprocess.Popen([sys.executable, "-m", "graphify", *request["args"]],
                                 cwd=request["cwd"], env=env, stdout=log, stderr=log)
        while child.poll() is None:
            rss = windows_rss(child.pid)
            if rss is not None:
                peak = max(peak or 0, rss); samples += 1
            time.sleep(0.25)
    result = {"exitCode": child.returncode, "durationMs": round((time.perf_counter()-started)*1000),
              "sampledPeakProcessTreeWorkingSetBytes": peak, "memorySamples": samples,
              "memorySampleIntervalMs": 250, "args": request["args"], "log": request["log"]}
    Path(request["result"]).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))
    sys.exit(child.returncode)


if __name__ == "__main__":
    main()
