import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, START, END } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { logger } from "./logger.js";

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

// Initialize the model
const getModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new ChatGoogleGenerativeAI({
    apiKey,
    model: "gemini-3-flash-preview",
    // model: "gemini-2.5-flash",
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
  - Patient demographics (if available)
  - Date of report
  - Type of report (Lab, MRI, X-Ray, etc.)
  - Key findings and measurements
  - Reference ranges and abnormal values
  - Doctor's impressions/conclusions.
  
  Be precise and thorough. If multiple files are provided, combine them into one coherent extraction and mention which file each major finding came from when useful.
  The extraction should be in English for internal processing.
  
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

  return { rawExtraction: response.content as string };
};

// Node 2: Simplify and provide insights
const simplifyNode = async (state: ReportStateType) => {
  const model = getModel();
  
  const prompt = `You are a compassionate medical communicator. 
  Based on the following raw extraction from a medical report, create a "Patient-Friendly Summary" in ${state.language || 'English'}.
  
  Requirements:
  1. Use simple, non-medical language.
  2. Explain what the findings mean in plain ${state.language || 'English'}.
  3. Highlight what is normal and what might need attention.
  4. Provide a "Key Takeaway" section.
  5. Ensure the tone is empathetic and clear.
  6. DO NOT include any greetings, introductory messages, or pleasantries (e.g., "Namaste", "Hello [Name]", "Here is a summary of your report", etc.). Start directly with the core summary.
  
  Raw Data:
  ${state.rawExtraction}`;

  const response = await model.invoke(prompt);
  
  return { simplifiedReport: response.content as string };
};

// Node 3: Generate recommendations
const recommendNode = async (state: ReportStateType) => {
  const model = getModel();
  
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
  
  Findings:
  ${state.rawExtraction}`;

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
  
  Findings: ${state.rawExtraction}`;
  
  const insightsResponse = await model.invoke(insightsPrompt);

  const resourcesPrompt = `Based on the medical report findings below, provide 2-3 links to reputable health resources (like Mayo Clinic, NIH, or Cleveland Clinic) that provide more information about the conditions or tests mentioned.
  
  Findings: ${state.rawExtraction}
  
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
    recommendations: lines.length > 0 ? lines : ["An error occurred while generating recommendations."],
    insights: insightsResponse.content as string,
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
