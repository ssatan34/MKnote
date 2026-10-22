"""Compatibility entry point for the transparent feather icon exporter."""
from pathlib import Path
import subprocess

if __name__ == "__main__":
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         str(Path(__file__).with_suffix(".ps1"))],
        check=True,
    )