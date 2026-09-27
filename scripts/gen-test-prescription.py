#!/usr/bin/env python
"""Generates a fake prescription PDF for end-to-end extraction testing.

This is dev tooling — never used in production. Output goes to /tmp.
"""
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
import os, hashlib, sys

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/medivault/prescription.pdf"
os.makedirs(os.path.dirname(out), exist_ok=True)

c = canvas.Canvas(out, pagesize=LETTER)
y = 740

def line(text, dy=20, size=11, bold=False):
    global y
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(72, y, text)
    y -= dy

line("RIVERSIDE MEDICAL GROUP", size=14, bold=True)
line("Dr. Sarah Chen, MD — Internal Medicine", size=10)
line("123 Health Way, Springfield IL 62701  |  License #IL-44218", size=9)
y -= 10
line("PATIENT: Alice Patient", bold=True)
line("DOB: 1990-04-15")
line("DATE OF VISIT: 2026-04-12")
y -= 10
line("DIAGNOSIS:", bold=True)
line("  - Essential (primary) hypertension")
line("  - Type 2 diabetes mellitus without complications")
y -= 10
line("ALLERGIES:", bold=True)
line("  - Penicillin (rash)")
line("  - Sulfa drugs")
y -= 10
line("PRESCRIPTIONS:", bold=True)
line("  1. Lisinopril 10 mg, take 1 tablet by mouth once daily")
line("  2. Metformin 500 mg, take 1 tablet by mouth twice daily with meals")
y -= 10
line("LAB RESULTS (drawn 2026-04-10):", bold=True)
line("  HbA1c: 7.2 %  (target < 7.0)")
line("  Blood pressure: 138/86 mmHg")
line("  Fasting glucose: 142 mg/dL")
y -= 10
line("VACCINATIONS ADMINISTERED TODAY:", bold=True)
line("  - Influenza vaccine, lot #FLU-2026-A")

c.save()

with open(out, "rb") as f:
    data = f.read()
print(f"path={out}")
print(f"bytes={len(data)}")
print(f"sha256={hashlib.sha256(data).hexdigest()}")
