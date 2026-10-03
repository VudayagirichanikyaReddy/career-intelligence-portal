import io
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class WatermarkedCanvas(canvas.Canvas):
    """Draws a professional, semi-transparent diagonal watermark across each page."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pages = []

    def showPage(self):
        self.pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self.pages)
        for page in self.pages:
            self.__dict__.update(page)
            self.draw_watermark()
            self.draw_footer(num_pages)
            super().showPage()
        super().save()

    def draw_watermark(self):
        self.saveState()
        self.setFont("Helvetica-Bold", 50)
        self.setFillColor(colors.HexColor("#6366f1"), alpha=0.08)
        self.translate(300, 420)
        self.rotate(42)
        self.drawCentredString(0, 0, "CAREERIQ VERIFIED")
        self.restoreState()

    def draw_footer(self, total_pages):
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#7b879c"))
        self.drawString(54, 32, "CareerIQ Candidate Intelligence Report · Confidential")
        self.drawRightString(612 - 54, 32, f"Page {self._pageNumber} of {total_pages}")
        self.restoreState()

def generate_match_report_pdf(eval_data: dict, applicant_info: dict, position_info: dict, recommendations: list = None) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0f172a")
    )
    subtitle_style = ParagraphStyle(
        "DocSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#64748b")
    )
    section_h2 = ParagraphStyle(
        "SectionH2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=14,
        spaceAfter=6
    )
    body = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155")
    )
    score_style = ParagraphStyle(
        "ScoreBig",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=36,
        leading=38,
        alignment=1,
        textColor=colors.HexColor("#4f46e5")
    )

    story = []

    # 1. Header Banner
    header_data = [
        [
            Paragraph("<b>CareerIQ</b> · Candidate Evaluation Audit", title_style),
            Paragraph(f"Generated: {datetime.now().strftime('%b %d, %Y')}<br/>Report ID: #RPT-{position_info.get('position_id', 1):03d}-{applicant_info.get('applicant_id', 1):03d}", subtitle_style)
        ]
    ]
    header_table = Table(header_data, colWidths=[330, 174])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (1,0), (1,0), 'RIGHT'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 16))

    # Divider bar
    divider = Table([[""]], colWidths=[504], rowHeights=[2])
    divider.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#4f46e5")),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(divider)
    story.append(Spacer(1, 18))

    # 2. Executive Summary Box (Score + Meta)
    score_val = round(float(eval_data.get("match_score") or eval_data.get("match_percentage") or 0))
    elig_text = "ELIGIBLE" if eval_data.get("eligible") else "REQUIREMENTS NOT MET"
    elig_color = colors.HexColor("#059669") if eval_data.get("eligible") else colors.HexColor("#e11d48")

    meta_left = f"""
    <b>Candidate:</b> {applicant_info.get('full_name', 'N/A')}<br/>
    <b>Target Role:</b> {position_info.get('title', 'N/A')} ({position_info.get('company', 'N/A')})<br/>
    <b>Location:</b> {position_info.get('location', 'N/A')}<br/>
    <b>Experience:</b> {applicant_info.get('experience_years', 0)} Years (Req: {position_info.get('min_experience_years', 0)}+ Years)<br/>
    <b>Candidate GPA:</b> {applicant_info.get('gpa', 'N/A')} (Cutoff: {position_info.get('min_gpa', 'N/A')})
    """

    meta_table_data = [
        [
            Paragraph(meta_left, body),
            [
                Paragraph(f"{score_val}%", score_style),
                Paragraph("<font size='9' color='#64748b'><b>OVERALL MATCH</b></font>", ParagraphStyle("C", alignment=1)),
                Spacer(1, 4),
                Paragraph(f"<font color='{elig_color.hexval()}'><b>● {elig_text}</b></font>", ParagraphStyle("C2", alignment=1))
            ]
        ]
    ]
    meta_table = Table(meta_table_data, colWidths=[340, 164])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#e2e8f0")),
        ('PADDING', (0,0), (-1,-1), 12),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LINEBEFORE', (1,0), (1,0), 1, colors.HexColor("#e2e8f0")),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 20))

    # 3. Competencies Comparison Table
    story.append(Paragraph("Competency & Skill Matching Breakdown", section_h2))

    matched_skills = eval_data.get("matched_skills") or []
    missing_skills = eval_data.get("missing_skills") or []

    skills_data = [["Verified Matched Skills", "Missing / Target Skill Gaps"]]
    max_len = max(len(matched_skills), len(missing_skills), 1)

    for i in range(max_len):
        m_skill = f"✓  {matched_skills[i]}" if i < len(matched_skills) else "—"
        g_skill = f"✕  {missing_skills[i]}" if i < len(missing_skills) else "—"
        skills_data.append([m_skill, g_skill])

    skills_table = Table(skills_data, colWidths=[252, 252])
    skills_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor("#334155")),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ('TEXTCOLOR', (0,1), (0,-1), colors.HexColor("#059669")),
        ('TEXTCOLOR', (1,1), (1,-1), colors.HexColor("#e11d48")),
    ]))
    story.append(skills_table)
    story.append(Spacer(1, 20))

    # 4. Learning Roadmaps Section
    if recommendations:
        story.append(Paragraph("Curated Learning Roadmap (YouTube Courses)", section_h2))
        rec_rows = [["Skill", "Recommended Course", "Channel"]]
        for r in recommendations[:5]:
            rec_rows.append([
                r.get("skill", "Tech"),
                r.get("title", "")[:45] + "...",
                r.get("channel", "YouTube")
            ])
        rec_table = Table(rec_rows, colWidths=[100, 280, 124])
        rec_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f1f5f9")),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(rec_table)

    doc.build(story, canvasmaker=WatermarkedCanvas)
    buffer.seek(0)
    return buffer.getvalue()
