import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { analyzeFile } from '@/lib/fileAnalysis'
import { UploadedFile } from '@/lib/types'
import { 
  FileText, 
  ChartBar, 
  ListChecks, 
  Sparkle,
  CheckCircle,
  Warning,
  Info
} from '@phosphor-icons/react'

interface FileAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: UploadedFile | null
}

interface AnalysisResult {
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

export function FileAnalysisDialog({ open, onOpenChange, file }: FileAnalysisDialogProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [progress, setProgress] = useState(0)

  const handleAnalyze = async () => {
    if (!file) return

    setIsAnalyzing(true)
    setProgress(0)

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + 10
      })
    }, 200)

    try {
      const result = await analyzeFile(file)
      setAnalysis(result)
      setProgress(100)
    } catch (error) {
      console.error('File analysis failed:', error)
    } finally {
      clearInterval(progressInterval)
      setIsAnalyzing(false)
    }
  }

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-yellow-500'
    return 'text-orange-500'
  }

  const getQualityLabel = (score: number) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    return 'Needs Improvement'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkle className="text-primary" size={24} weight="fill" />
            AI File Analysis
          </DialogTitle>
          <DialogDescription>
            {file ? `Analyzing ${file.name}` : 'No file selected'}
          </DialogDescription>
        </DialogHeader>

        {file && !analysis && !isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-12 gap-6">
            <div className="p-4 bg-primary/10 rounded-full">
              <FileText className="text-primary" size={48} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-semibold text-lg">Ready to analyze</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                AI will analyze the content, extract insights, provide recommendations, and assess quality.
              </p>
            </div>
            <Button onClick={handleAnalyze} size="lg" className="gap-2">
              <Sparkle size={20} weight="fill" />
              Start Analysis
            </Button>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-12 gap-6">
            <div className="p-4 bg-primary/10 rounded-full animate-pulse">
              <Sparkle className="text-primary" size={48} weight="fill" />
            </div>
            <div className="w-full max-w-md space-y-3">
              <div className="text-center">
                <h3 className="font-semibold text-lg">Analyzing file...</h3>
                <p className="text-sm text-muted-foreground">This may take a few moments</p>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">{progress}% complete</p>
            </div>
          </div>
        )}

        {analysis && !isAnalyzing && (
          <Tabs defaultValue="summary" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="summary" className="gap-2">
                <FileText size={16} />
                Summary
              </TabsTrigger>
              <TabsTrigger value="insights" className="gap-2">
                <Sparkle size={16} weight="fill" />
                Insights
              </TabsTrigger>
              <TabsTrigger value="metadata" className="gap-2">
                <ChartBar size={16} />
                Metadata
              </TabsTrigger>
              <TabsTrigger value="recommendations" className="gap-2">
                <ListChecks size={16} />
                Suggestions
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-4">
              <TabsContent value="summary" className="space-y-4 mt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Quality Score</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-bold ${getQualityColor(analysis.qualityScore)}`}>
                        {analysis.qualityScore}
                      </span>
                      <Badge variant="outline" className={getQualityColor(analysis.qualityScore)}>
                        {getQualityLabel(analysis.qualityScore)}
                      </Badge>
                    </div>
                  </div>
                  <Progress value={analysis.qualityScore} className="h-2" />
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Summary</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis.summary}</p>
                </div>
              </TabsContent>

              <TabsContent value="insights" className="space-y-4 mt-0">
                <h3 className="font-semibold text-lg">Key Insights</h3>
                <div className="space-y-3">
                  {analysis.insights.map((insight, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 bg-accent/20 rounded-lg">
                      <CheckCircle className="text-accent flex-shrink-0 mt-0.5" size={20} weight="fill" />
                      <p className="text-sm">{insight}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="metadata" className="space-y-4 mt-0">
                <h3 className="font-semibold text-lg">File Metadata</h3>
                <div className="grid grid-cols-2 gap-4">
                  {analysis.metadata.wordCount && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Info size={16} />
                        Word Count
                      </div>
                      <p className="text-2xl font-bold">{analysis.metadata.wordCount.toLocaleString()}</p>
                    </div>
                  )}
                  {analysis.metadata.lineCount && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Info size={16} />
                        Line Count
                      </div>
                      <p className="text-2xl font-bold">{analysis.metadata.lineCount.toLocaleString()}</p>
                    </div>
                  )}
                  {analysis.metadata.characterCount && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Info size={16} />
                        Character Count
                      </div>
                      <p className="text-2xl font-bold">{analysis.metadata.characterCount.toLocaleString()}</p>
                    </div>
                  )}
                  {analysis.metadata.estimatedReadTime && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Info size={16} />
                        Est. Read Time
                      </div>
                      <p className="text-2xl font-bold">{analysis.metadata.estimatedReadTime}</p>
                    </div>
                  )}
                  {analysis.metadata.detectedLanguage && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Info size={16} />
                        Language
                      </div>
                      <p className="text-2xl font-bold">{analysis.metadata.detectedLanguage}</p>
                    </div>
                  )}
                  {analysis.metadata.sentiment && (
                    <div className="p-4 bg-card border border-border rounded-lg">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Info size={16} />
                        Sentiment
                      </div>
                      <p className="text-2xl font-bold capitalize">{analysis.metadata.sentiment}</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-4 mt-0">
                <h3 className="font-semibold text-lg">AI Recommendations</h3>
                <div className="space-y-3">
                  {analysis.recommendations.map((recommendation, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                      <Warning className="text-primary flex-shrink-0 mt-0.5" size={20} weight="fill" />
                      <p className="text-sm">{recommendation}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {analysis && (
            <Button onClick={handleAnalyze} className="gap-2">
              <Sparkle size={16} weight="fill" />
              Re-analyze
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
