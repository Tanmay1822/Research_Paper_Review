from dotenv import load_dotenv
load_dotenv()
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

api = os.getenv("GEMINI_API_KEY")
assert api, "GEMINI_API_KEY missing"

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api)
resp = llm.invoke([HumanMessage(content="Respond with OK only.")])
print("Gemini response:", resp.content)