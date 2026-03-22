import { sparkLlmPrompt } from './sparkLlmPrompt'
import { UploadedFile } from './types'

export interface FileAnalysisResult {
  summary: string
  insights: string[]
  metadata: {
    wordCount?: number
    lineCount?: number
    characterCount?: number
    estimatedReadTime?: string
    detectedLanguage?: string
    sentiment?: 'positive' | 'neutral' | 'negative'
  }
  recommendations: string[]
  qualityScore: number
}

function calculateBasicMetrics(content: string) {
  const lines = content.split('\n')
  const words = content.trim().split(/\s+/).filter(Boolean)
  const characters = content.length
  const readTimeMinutes = Math.ceil(words.length / 200)

  return {
    lineCount: lines.length,
    wordCount: words.length,
    characterCount: characters,
    estimatedReadTime: readTimeMinutes === 1 ? '1 min' : `${readTimeMinutes} mins`,
  }
}

export async function analyzeFile(file: UploadedFile): Promise<FileAnalysisResult> {
  const basicMetrics = calculateBasicMetrics(file.content)

  const prompt = sparkLlmPrompt`You are an expert file analyzer. Analyze this file and provide detailed feedback.

File Name: ${file.name}
File Type: ${file.type}
File Size: ${(file.size / 1024).toFixed(2)} KB
Content:
${file.content.substring(0, 8000)}${file.content.length > 8000 ? '\n... (content truncated)' : ''}

Provide your analysis in the following JSON format:
{
  "summary": "A 2-3 sentence overview of the file content and purpose",
  "insights": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "metadata": {
    "detectedLanguage": "natural language or programming language detected",
    "sentiment": "positive" | "neutral" | "negative"
  },
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"],
  "qualityScore": <number between 0-100 based on content quality, structure, clarity>
}`

  const result = await window.spark.llm(prompt, 'gpt-4o-mini', true)
  const analysis = JSON.parse(result)

  return {
    summary: analysis.summary || 'Analysis completed.',
    insights: analysis.insights || [],
    metadata: {
      ...basicMetrics,
      detectedLanguage: analysis.metadata?.detectedLanguage,
      sentiment: analysis.metadata?.sentiment,
    },
    recommendations: analysis.recommendations || [],
    qualityScore: analysis.qualityScore || 75,
  }
}

export async function analyzeMultipleFiles(files: UploadedFile[]): Promise<string> {
  const fileList = files
    .map((f, idx) => `${idx + 1}. ${f.name} (${f.type}, ${(f.size / 1024).toFixed(2)} KB)`)
    .join('\n')

  const combinedContent = files
    .map((f) => `=== ${f.name} ===\n${f.content.substring(0, 2000)}`)
    .join('\n\n')

  const prompt = sparkLlmPrompt`Analyze these multiple files as a collection and provide a comprehensive overview:

Files:
${fileList}

Content Preview:
${combinedContent}

Provide:
1. Overall purpose and relationship between files
2. Common themes or patterns
3. Suggestions for improvement
4. Any missing pieces or gaps`

  return await window.spark.llm(prompt, 'gpt-4o-mini')
}
