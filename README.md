# Full-Stack RAG-Based Research Log Platform

---

This repository contains a full-stack web platform built to digitally document and analyze experimental biology research conducted at **Bugil Academy (South Korea)** and **Hwa Chong Institution (Singapore)**.

The system integrates structured experimental data storage with a **Retrieval-Augmented Generation (RAG)** AI assistant to provide context-aware scientific explanations of research logs.

The application is containerized using **Docker** and deployed on **AWS Elastic Beanstalk**, demonstrating production-style cloud deployment of a full-stack AI-enabled web application.

---

## Live Deployment

Hosted on AWS Elastic Beanstalk:

[http://researchlog-env.<region>.elasticbeanstalk.com](http://researchlog-env.eba-pptyxixy.us-east-2.elasticbeanstalk.com/)

---

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

### Cloud & Deployment
- Docker (containerization)
- AWS Elastic Beanstalk (cloud hosting)
- Amazon EC2 (underlying compute)
- IAM roles for secure environment configuration

Experimented with local Kubernetes deployment using kind.


<img width="1434" height="732" alt="Screenshot 2026-02-15 at 9 45 16 pm" src="https://github.com/user-attachments/assets/50b1ea37-697a-405b-85d4-04edb831ec0b" />
<img width="1429" height="730" alt="Screenshot 2026-02-15 at 9 45 43 pm" src="https://github.com/user-attachments/assets/75e0699f-0ce5-4f7e-988c-c63dd24f2847" />
<img width="1427" height="726" alt="Screenshot 2026-02-15 at 9 46 43 pm" src="https://github.com/user-attachments/assets/f6253abe-be06-4b87-81a8-c58600d164d5" />
<img width="1069" height="653" alt="Screenshot 2026-02-15 at 9 47 00 pm" src="https://github.com/user-attachments/assets/6959b4f4-d488-47ab-a51b-e633121ab36c" />

---

## Project Overview

This web application was built to:

- Digitally document experimental research logs  
- Provide structured backend storage via a SQL database  
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

### This architecture ensures:

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

## Environment Configuration

Sensitive credentials are managed securely:

- `OPENAI_API_KEY` is stored via environment variables.
- No API credentials are committed to the repository.
- AWS IAM roles are used for secure cloud configuration.

---

## Containerization & Deployment

The application is packaged using Docker:

- Dockerfile defines runtime environment
- Application image built locally
- Deployed to AWS Elastic Beanstalk using Docker platform
