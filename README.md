# Web Report Platform  

---

This repository contains the full-stack web report platform for a biology research project conducted at **Bugil Academy (South Korea)** and **Hwa Chong Institution (Singapore)**.

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
