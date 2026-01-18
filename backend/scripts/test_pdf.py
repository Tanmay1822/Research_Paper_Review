from unstructured.partition.pdf import partition_pdf
import os

# Path to the sample PDF
pdf_path = os.path.join(os.path.dirname(__file__), '..', 'sample.pdf')

def test_ingestion():
    print(f"Loading PDF from: {pdf_path}")
    try:
        # Partition the PDF
        elements = partition_pdf(filename=pdf_path)
        
        # Combine extracted text
        text = "\n\n".join([str(el) for el in elements])
        
        # Print first 500 characters
        print("-" * 20)
        print("Extracted Text Preview:")
        print("-" * 20)
        print(text[:500])
        print("-" * 20)
        
    except Exception as e:
        print(f"Error processing PDF: {e}")

if __name__ == "__main__":
    test_ingestion()
