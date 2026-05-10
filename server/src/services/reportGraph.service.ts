import '../config/env.js';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, START, END } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { logger } from "../utils/logger.js";

interface ReportFileInput {
  fileName: string;
  mimeType: string;
  data: string;
}

// Define the state for our graph
const ReportState = Annotation.Root({
  fileData: Annotation<string>(), // Legacy single-file input.
  mimeType: Annotation<string>(),
  files: Annotation<ReportFileInput[]>(),
  language: Annotation<string>(), // Preferred patient-facing language.
  rawExtraction: Annotation<string>(),
  simplifiedReport: Annotation<string>(),
  recommendations: Annotation<string[]>(),
  resources: Annotation<{ title: string; url: string }[]>(),
  insights: Annotation<string>(),
  error: Annotation<string | null>(),
});

type ReportStateType = typeof ReportState.State;

const PII_POLICY = `Privacy requirements:
- Do not include direct identifiers in patient-facing output.
- Omit patient name, phone number, email, full address, government ID, hospital ID, MRN, barcode/QR values, accession number, sample ID, and bill/invoice numbers.
- Keep only clinically useful demographics such as age, sex, and report date when relevant.
- Refer to the person as "the patient" instead of using a name.`;

function redactPII(content: string): string {
  return content
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{4,6}/g, "[redacted phone/id]")
    .replace(/\b(?:MRN|UHID|UID|Patient\s*ID|Hospital\s*ID|Registration\s*No|Reg\.?\s*No|Accession\s*No|Sample\s*ID|Lab\s*ID|Bill\s*No|Invoice\s*No|Aadhaar|PAN|Passport)\s*[:#-]?\s*[A-Z0-9/-]{4,}\b/gi, "$1: [redacted]")
    .replace(/^\s*(?:Patient\s*Name|Name)\s*[:#-].*$/gim, "Patient name: [redacted]")
    .replace(/^\s*(?:Address|Location)\s*[:#-].*$/gim, "Address: [redacted]")
    .replace(/^\s*(?:Phone|Mobile|Contact|Email)\s*[:#-].*$/gim, "$1: [redacted]");
}

// Initialize the model
const getModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model=process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new ChatGoogleGenerativeAI({
    apiKey,
    // model: "gemini-3-flash-preview",
    model: model,
    maxOutputTokens: 5048,
  });
};

// Node 1: Extract information
const extractNode = async (state: ReportStateType) => {
  const model = getModel();
  const files = state.files?.length
    ? state.files
    : state.fileData && state.mimeType
      ? [{ fileName: "Medical report", mimeType: state.mimeType, data: state.fileData }]
      : [];

  if (files.length === 0) {
    throw new Error("No report files were provided for extraction.");
  }
  
  const prompt = `You are a medical data extraction expert. 
  Extract all relevant information from the attached medical report file${files.length > 1 ? "s" : ""}. 
  Include: 
  - Clinically relevant patient demographics only, such as age and sex if available
  - Date of report
  - Type of report (Lab, MRI, X-Ray, etc.)
  - Key findings and measurements
  - Reference ranges and abnormal values
  - Doctor's impressions/conclusions.
  
  Be precise and thorough. If multiple files are provided, combine them into one coherent extraction and mention which file each major finding came from when useful.
  The extraction should be in English for internal processing.
  ${PII_POLICY}
  
  Attached files:
  ${files.map((file, index) => `${index + 1}. ${file.fileName} (${file.mimeType})`).join("\n")}`;

  const response = await model.invoke([
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...files.map((file) => ({
          type: "media",
          mimeType: file.mimeType,
          data: file.data,
        })),
      ],
    },
  ]);

  return { rawExtraction: redactPII(response.content as string) };
};

// Node 2: Simplify and provide insights
const simplifyNode = async (state: ReportStateType) => {
  const model = getModel();
  const safeRawExtraction = redactPII(state.rawExtraction || '');
  
  const prompt = `You are a compassionate medical communicator. 
  Based on the following raw extraction from a medical report, create a "Patient-Friendly Summary" in ${state.language || 'English'}.
  
  Requirements:
  1. Use simple, non-medical language.
  2. Explain what the findings mean in plain ${state.language || 'English'}.
  3. Highlight what is normal and what might need attention.
  4. Provide a "Key Takeaway" section.
  5. Ensure the tone is empathetic and clear.
  6. DO NOT include any greetings, introductory messages, or pleasantries (e.g., "Namaste", "Hello [Name]", "Here is a summary of your report", etc.). Start directly with the core summary.
  7. ${PII_POLICY}
  
  Raw Data:
  ${safeRawExtraction}`;

  const response = await model.invoke(prompt);
  
  return { simplifiedReport: redactPII(response.content as string) };
};

// Node 3: Generate recommendations
const recommendNode = async (state: ReportStateType) => {
  const model = getModel();
  const safeRawExtraction = redactPII(state.rawExtraction || '');
  
  const recommendationsSchema = z.object({
    recommendations: z.array(z.string()).describe("A list of 3-5 personalized health recommendations and insights based on the report."),
  });

  const structuredModel = model.withStructuredOutput(recommendationsSchema, {
    name: "health_recommendations",
  });
  
  const prompt = `Based on the medical report findings below, generate 3-5 personalized health recommendations and insights in ${state.language || 'English'}.
  
  Guidelines:
  - Focus on lifestyle, diet, or follow-up questions for their doctor.
  - Suggest specific questions the patient should ask their healthcare provider.
  - Output should be in ${state.language || 'English'}.
  - ${PII_POLICY}
  
  Findings:
  ${safeRawExtraction}`;

  let lines: string[] = [];
  try {
    const response = await structuredModel.invoke(prompt);
    lines = response.recommendations;
  } catch (e) {
    logger.warn("analysis.recommendations_structured_output_failed", { error: e });
    // Fallback if structured output fails
    lines = ["An error occurred while generating recommendations."];
  }

  const insightsPrompt = `Based on the findings, provide a one-sentence encouraging insight in ${state.language || 'English'}.
  ${PII_POLICY}
  
  Findings: ${safeRawExtraction}`;
  
  const insightsResponse = await model.invoke(insightsPrompt);

  const resourcesPrompt = `Based on the medical report findings below, provide 2-3 links to reputable health resources (like Mayo Clinic, NIH, or Cleveland Clinic) that provide more information about the conditions or tests mentioned.
  ${PII_POLICY}
  
  Findings: ${safeRawExtraction}
  
  Format the output as a JSON array of objects with "title" and "url" keys. Only return the JSON.`;

  const resourcesResponse = await model.invoke(resourcesPrompt);
  let resources = [];
  try {
    const content = resourcesResponse.content as string;
    const jsonMatch = content.match(/\[.*\]/s);
    if (jsonMatch) {
      resources = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    logger.warn("analysis.resources_parse_failed", { error: e });
  }

  return { 
    recommendations: (lines.length > 0 ? lines : ["An error occurred while generating recommendations."]).map(redactPII),
    insights: redactPII(insightsResponse.content as string),
    resources: resources
  };
};

// Build the graph
const workflow = new StateGraph(ReportState)
  .addNode("extract", extractNode)
  .addNode("simplify", simplifyNode)
  .addNode("recommend", recommendNode)
  .addEdge(START, "extract")
  .addEdge("extract", "simplify")
  .addEdge("extract", "recommend")
  .addEdge("recommend", END)
  .addEdge("simplify", END);

export const reportProcessor = workflow.compile();
