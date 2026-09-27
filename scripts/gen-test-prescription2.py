#!/usr/bin/env python
"""Second synthetic prescription with drugs NOT already in Alice's vault.
Used to verify the auto-promote logic creates new medication rows after
extraction.
"""
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
import os, hashlib, sys

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/medivault/prescription2.pdf"
os.makedirs(os.path.dirname(out), exist_ok=True)

c = canvas.Canvas(out, pagesize=LETTER)
y = 740

def line(text, dy=20, size=11, bold=False):
    global y
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(72, y, text)
    y -= dy

line("RIVERSIDE MEDICAL GROUP", size=14, bold=True)
line("Dr. Sarah Chen, MD - Internal Medicine", size=10)
y -= 10
line("PATIENT: Alice Patient", bold=True)
line("DATE OF VISIT: 2026-05-08")
y -= 10
line("FOLLOW-UP PRESCRIPTIONS:", bold=True)
line("  1. Amlodipine 5 mg, take 1 tablet by mouth once daily")
line("  2. Atorvastatin 40 mg, take 1 tablet by mouth at bedtime")
line("  3. Vitamin D3 1000 IU, take 1 capsule by mouth once daily")

c.save()

with open(out, "rb") as f:
    data = f.read()
print(f"path={out}")
print(f"bytes={len(data)}")
print(f"sha256={hashlib.sha256(data).hexdigest()}")
