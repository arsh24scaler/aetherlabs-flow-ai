# 🧠 Flow AI

Flow AI is the flagship **Policy Intelligence Engine** built by **AetherLabs**, tailored specifically as an operating system for insurance intermediaries (brokers, agencies, agents, and underwriters). It is designed to quickly ingest complex insurance policies, structure the data, and provide an intelligent, interactive layer to query and analyze the document.

The goal of Flow AI is not to be a generic chat bot, but an institutional-grade tool that reduces operational chaos, tracks commissions, finds hidden risks, and empowers intermediaries handling hundreds of clients.

---

## 🚀 Core Capabilities & Features

### 1. 📄 Smart Document Ingestion & Structuring
- **Upload & Parse Engine**: Upload complex, multi-page insurance PDFs (Health, Motor, Life, Term, Commercial, etc.).
- **Automatic Field Extraction**: Instantly extracts and structures core policy details even if buried in fine print or tables:
  - Policy Holder Name & Policy Number
  - Insurer Legal Name
  - Policy Type Category
  - Start Date & Expiry Date
  - Premium Amounts & Sum Insured (with accurate currencies)
  - Deductibles details
  - Riders, Endorsements, Add-ons
  - No Claim Bonus
- **Background Queue Processing**: Heavy documents are processed reliably in the background via queue workers (Service Bus/Redis) preventing browser timeouts.
- **Cache System**: Processed documents are safely cached in Redis for fast retrieval so returning to a policy is instant.

### 2. 🛡️ Automated Risk Detection
Flow AI acts as a digital underwriter, evaluating the text to output a 0-100 **Risk Score** (100 being highly risky) based on:
- **Red Flags Extraction**: Detects missing standard clauses, short coverage periods, and hidden conditions.
- **Deductibles vs Coverage**: Flags when deductibles are unusually high relative to the sum insured.
- **Ambiguity Detection**: Highlights undefined terms or ambiguous wording that could cause claim disputes.
- **Sub-limits & Copayments**: Automatically alerts you to percentage sub-limits that handicap main coverages or heavy copayment clauses.
- **Clause Citations**: Every flag contains a direct citation of the actual clause from the document for verification.

### 3. 📊 Interactive Policy Snapshot UI
- **Beautiful Dashboard**: Instantly view the structured data on a clean, modern UI card upon upload.
- **Graceful Fallbacks**: If certain data (like riders) isn't present in specific policies, the UI degrades gracefully, showing "Not Specified" rather than breaking.
- **Export UI as Image**: One-click download of the complete Policy Snapshot UI as a polished PNG image to easily share with clients on WhatsApp or Email.

### 4. 💬 Intelligent Policy Chat & Decoder
- **Strict Document Grounding**: The AI answers queries *strictly* based on the text of the uploaded PDF, citing exact sections and clauses whenever possible.
- **Educational Fallback**: If a term or detail isn't in the document, Flow AI leverages its deep domain knowledge to educate you on how it typically works in the industry, clearly distinguishing between document facts and general industry standards.
- **Conversational Streaming**: Natural, typewriter-style progressive text streaming mimics premium AI interfaces (like ChatGPT) for a seamless UX.

### 5. ⚡ Actionable Intelligence (Suggestion Pills)
- **Context-Aware Suggestions**: Instead of generic questions, the AI analyzes the specific policy and generates the "Top 3 highly useful tasks" you can command it to do (e.g., "Create a summary of exclusions").
- **One-Click Execution**: Clicking a suggestion pill doesn't just fill the input box—it instantly fires the command to the AI so you get answers immediately.

### 6. 🔮 Scenario Claim Simulation
- **"What-If" Analysis**: Ask hypothetical questions like "What happens if my roof leaks?" or "How much if I total my car?".
- **Data-Backed Estimates**: Flow AI cross-references covers against deductibles to simulate out-of-pocket costs vs. insurer payouts, complete with the specific clause references.

### 7. 📥 Dynamic Export Engine
Unlike traditional apps with static reports, Flow AI features a generation engine that creates documents on the fly based on conversational commands:
- **Standard PDF Export**: Quick download of the structured policy data in PDF form.
- **Full Excel Report**: Tabular download of the structured policy metadata for spreadsheet management.
- **Custom Dynamic PDF**: Tell the AI in chat (e.g., "Give me a PDF explaining the claims process") and it will generate, format, and serve a secure download button for a custom PDF document.
- **Custom Dynamic Excel**: Tell the AI (e.g., "Make an Excel of the coverages") and a button to download the custom generated `.xlsx` file will appear.
- **Custom Dynamic Word (.docx)**: Just ask "Generate a Word document summarizing the exclusions." Flow AI will create a comprehensively structured Microsoft Word document and provide a one-click download button directly in the chat stream.

---

## � Flow AI Persona & Tone
Flow AI is explicitly programmed to communicate as an institutional infrastructure tool built by AetherLabs.
- **Tone**: Confident, Calm, Institutional, Clear, and Technical. 
- **Style**: It avoids emojis, overly "hype" language, cringe startup vocabulary, or "disrupting the industry" claims.
- **Audience**: Intermediaries running real insurance businesses, not casual end-consumers.

---
*Built by AetherLabs — Insurance does not run on apps. It runs on people. We build for them.*
