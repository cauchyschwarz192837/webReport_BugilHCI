# Web Report Platform  

---

This repository contains the full-stack web report platform for a biology research project conducted at Bugil Academy (South Korea) and Hwa Chong Institution (Singapore).

The platform presents research objectives, methodology, experimental results, references, and a persistent experimental datalog system — enhanced with a Retrieval-Augmented AI assistant for intelligent interpretation of research entries.

## Technology Stack

### Frontend
- HTML  
- CSS  
- Vanilla JavaScript (Fetch API)

### Backend
- Node.js  
- Express.js  
- SQL database for persistent log storage  

### AI Infrastructure
- LangChain v1 modular packages  
- MemoryVectorStore
- Retrieval chain (`@langchain/classic`)  
- OpenAI SDK  

<img width="1434" height="732" alt="Screenshot 2026-02-15 at 9 45 16 pm" src="https://github.com/user-attachments/assets/50b1ea37-697a-405b-85d4-04edb831ec0b" />
<img width="1429" height="730" alt="Screenshot 2026-02-15 at 9 45 43 pm" src="https://github.com/user-attachments/assets/75e0699f-0ce5-4f7e-988c-c63dd24f2847" />
<img width="1427" height="726" alt="Screenshot 2026-02-15 at 9 46 43 pm" src="https://github.com/user-attachments/assets/f6253abe-be06-4b87-81a8-c58600d164d5" />
<img width="1069" height="653" alt="Screenshot 2026-02-15 at 9 47 00 pm" src="https://github.com/user-attachments/assets/6959b4f4-d488-47ab-a51b-e633121ab36c" />

---

## Project Overview

This web application was built to:

- Digitally document experimental research logs  
- Provide structured storage via a backend database  
- Enable dynamic querying of stored entries  
- Integrate a context-aware AI assistant for scientific interpretation  

The system uses a **Retrieval-Augmented Generation (RAG)** architecture built with LangChain.

---

## AI Chatbot Architecture (RAG Pipeline)

The embedded chatbot uses a modular retrieval pipeline:

1. Experimental logs are stored in a SQL-backed database via Node.js + Express.
2. Logs are dynamically chunked and embedded into a vector store.
3. A semantic retriever selects relevant content based on user queries.
4. Retrieved documents are passed into a retrieval chain.
5. The OpenAI LLM generates grounded explanations using retrieved context.

This architecture ensures:

- Reduced hallucination  
- Context-aware scientific explanations  
- Scalable document expansion  
- Modular upgrade path to persistent vector databases (e.g., Chroma, Pinecone)

---

## Command-Based Interaction Model

To activate AI-assisted interpretation:

1. Select the date of a stored research log.
2. Type `!!!` and click **Send** to trigger automated explanation.
3. Type `!!! your question here` to ask specific questions about that selected log.

The `!!!` prefix routes the request through the retrieval chain instead of standard UI handling.

---

- OpenAI API key is stored via environment variables (`OPENAI_API_KEY`)
- No API credentials are committed to the repository
