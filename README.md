# MedInsight AI

MedInsight AI is an AI-powered medical report analyzer that simplifies complex lab and imaging reports into actionable insights and recommendations. It uses LangGraph and Gemini AI to provide a compassionate and clear understanding of health data.

## Features

- **AI-Powered Extraction**: Automatically extracts key information from PDF or image-based medical reports.
- **Multilingual Support**: Get results in **English**, **Hindi**, or **Marathi**.
- **Simplified Summaries**: Translates medical jargon into plain, patient-friendly language.
- **Actionable Insights**: Provides personalized health recommendations and follow-up questions for your doctor.
- **Trusted Resources**: Links to reputable health organizations (Mayo Clinic, NIH, etc.) for further learning.
- **Secure & Private**: Processes data securely using state-of-the-art AI.

## Tech Stack

- **Frontend**: React, Tailwind CSS, Framer Motion
- **Account & Storage**: Firebase Auth, Firestore, Firebase Storage
- **Backend**: Express.js with Firebase Admin SDK
- **AI Orchestration**: LangChain, LangGraph
- **LLM**: Gemini 3 Flash (via @google/genai)
- **Icons**: Lucide React
- **Formatting**: React Markdown

## Firebase Setup

Enable Google sign-in in Firebase Authentication, create Firestore and Storage for the configured project, and deploy the included rules:

```bash
firebase deploy --only firestore:rules,storage
```

For local backend development, keep the service account JSON outside source control and point `FIREBASE_SERVICE_ACCOUNT_PATH` to it in `.env`. In managed Google Cloud runtimes, leave that value empty and use Application Default Credentials.

## Application Screens

The application includes the following main screens:

- **Report Summary**: A structured, easy-to-read breakdown of the findings.
- **Personalized Insights**: Encouraging insights and specific health recommendations.
- **Doctor's Visit Prep**: A curated list of questions to ask during the next consultation.
- **Trusted Resources**: Direct links to authoritative medical information.

<table>
  <tr>
    <td width="50%">
      <strong>Upload Screen</strong><br />
      <img src="public/image-1.png" alt="Upload Screen" width="100%" />
    </td>
    <td width="50%">
      <strong>Processing Screen</strong><br />
      <img src="public/image-2.png" alt="Processing Screen" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Result Screen</strong><br />
      <img src="public/image-3.png" alt="Result Screen" width="100%" />
    </td>
    <td width="50%">
      <strong>Insights Screen</strong><br />
      <img src="public/image-4.png" alt="Insights Screen" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Saved Reports Screen</strong><br />
      <img src="public/image-5.png" alt="Saved Reports Screen" width="100%" />
    </td>
    <td width="50%"></td>
  </tr>
</table>

## Disclaimer

This application is for informational purposes only. It is not a medical diagnosis or professional medical advice. Always consult with a qualified healthcare provider regarding any medical condition or test results.
