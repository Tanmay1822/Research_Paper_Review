from fpdf import FPDF
import os

def create_pdf():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, txt="Hello Anti-Gravity Team", ln=1, align="C")
    
    output_path = os.path.join(os.path.dirname(__file__), '..', 'sample.pdf')
    pdf.output(output_path)
    print(f"Created sample PDF at: {output_path}")

if __name__ == "__main__":
    create_pdf()
