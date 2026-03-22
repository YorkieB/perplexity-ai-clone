import { useState } from 'react'
import { ModelResponse } from '@/lib/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { MarkdownRenderer } from './MarkdownRenderer'
import {
  CheckCircle,
  Warning,
  ArrowsLeftRight,
  Clock,
  Hash,
  FileArrowDown,
  CaretDown,
  Columns,
} from '@phosphor-icons/react'
import { toast } from 'sonner'

const getModelBadge = (modelId: string): { label: string; color: string } => {
  if (modelId.includes('gpt-4o-mini'))
    return { label: 'GPT-4o Mini', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' }
  if (modelId.includes('gpt-4o'))
    return { label: 'GPT-4o', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' }
  if (modelId.includes('claude-3.5-sonnet'))
    return {
      label: 'Claude 3.5 Sonnet',
      color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    }
  if (modelId.includes('claude-3-opus'))
    return { label: 'Claude 3 Opus', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' }
  if (modelId.includes('claude-3-haiku'))
    return { label: 'Claude 3 Haiku', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' }
  if (modelId.includes('gemini-2.0-flash'))
    return { label: 'Gemini 2.0 Flash', color: 'bg-teal-500/10 text-teal-500 border-teal-500/20' }
  return { label: modelId, color: 'bg-muted text-muted-foreground' }
}

interface ModelCouncilResponseProps {
  modelResponses: ModelResponse[]
  convergenceScore?: number
  commonThemes?: string[]
  divergentPoints?: string[]
  onCitationHover?: (index: number | null) => void
}

export function ModelCouncilResponse({
  modelResponses,
  convergenceScore,
  commonThemes,
  divergentPoints,
  onCitationHover,
}: ModelCouncilResponseProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [comparisonOpen, setComparisonOpen] = useState(false)

  const getConvergenceColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 50) return 'text-yellow-500'
    return 'text-orange-500'
  }

  const getConvergenceIcon = (score: number) => {
    if (score >= 80) return <CheckCircle size={20} weight="fill" />
    if (score >= 50) return <Warning size={20} weight="fill" />
    return <ArrowsLeftRight size={20} weight="bold" />
  }

  const formatResponseTime = (ms?: number) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatTokenCount = (tokens?: number) => {
    if (!tokens) return 'N/A'
    if (tokens < 1000) return `${tokens}`
    return `${(tokens / 1000).toFixed(1)}K`
  }

  const handleExportPDF = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const filename = `model-council-${timestamp}.txt`

    let content = '# Model Council Report\n\n'
    content += `Generated: ${new Date().toLocaleString()}\n\n`

    if (typeof convergenceScore === 'number') {
      content += `## Convergence Score: ${convergenceScore}%\n\n`
    }

    if (commonThemes && commonThemes.length > 0) {
      content += `## Common Themes\n\n`
      commonThemes.forEach((theme) => {
        content += `- ${theme}\n`
      })
      content += '\n'
    }

    if (divergentPoints && divergentPoints.length > 0) {
      content += `## Divergent Points\n\n`
      divergentPoints.forEach((point) => {
        content += `- ${point}\n`
      })
      content += '\n'
    }

    content += `## Model Responses (${modelResponses.length} models)\n\n`

    modelResponses.forEach((response) => {
      const modelBadge = getModelBadge(response.model)
      content += `### ${modelBadge.label}\n\n`
      content += `**Model ID:** ${response.model}\n`
      content += `**Response Time:** ${formatResponseTime(response.responseTime)}\n`
      content += `**Token Count:** ${formatTokenCount(response.tokenCount)}\n`
      content += `**Generated:** ${new Date(response.generatedAt).toLocaleString()}\n\n`
      content += `${response.content}\n\n`
      content += '---\n\n'
    })

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)

    toast.success('Council report exported successfully')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              Model Council
            </Badge>
            {typeof convergenceScore === 'number' && (
              <div className={`flex items-center gap-1.5 ${getConvergenceColor(convergenceScore)}`}>
                {getConvergenceIcon(convergenceScore)}
                <span className="text-sm font-medium">{convergenceScore}% convergence</span>
              </div>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {modelResponses.length} models consulted
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          className="gap-2"
        >
          <FileArrowDown size={16} />
          Export Report
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-muted/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {modelResponses.map((response, index) => {
            const modelBadge = getModelBadge(response.model)
            return (
              <TabsTrigger key={index} value={response.model} className="gap-2">
                <Badge variant="outline" className={`text-xs ${modelBadge.color} border`}>
                  {modelBadge.label}
                </Badge>
              </TabsTrigger>
            )
          })}
          {(commonThemes && commonThemes.length > 0) ||
          (divergentPoints && divergentPoints.length > 0) ? (
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="p-4 bg-card/50">
            <h3 className="text-sm font-semibold mb-3">Consensus Summary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This response synthesizes insights from {modelResponses.length} different AI models.
              {typeof convergenceScore === 'number' && convergenceScore >= 80 && (
                <span className="text-green-500 font-medium">
                  {' '}
                  The models show strong agreement on the key points.
                </span>
              )}
              {typeof convergenceScore === 'number' &&
                convergenceScore >= 50 &&
                convergenceScore < 80 && (
                  <span className="text-yellow-500 font-medium">
                    {' '}
                    The models generally agree but have some differing perspectives.
                  </span>
                )}
              {typeof convergenceScore === 'number' && convergenceScore < 50 && (
                <span className="text-orange-500 font-medium">
                  {' '}
                  The models offer notably different perspectives on this topic.
                </span>
              )}
            </p>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {modelResponses.map((response) => {
              const modelBadge = getModelBadge(response.model)
              return (
                <Card
                  key={response.model}
                  className="p-3 bg-card/30 hover:bg-card/50 transition-colors cursor-pointer"
                  onClick={() => setActiveTab(response.model)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className={`text-xs ${modelBadge.color}`}>
                      {modelBadge.label}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} />
                      <span>{formatResponseTime(response.responseTime)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Hash size={14} />
                      <span>{formatTokenCount(response.tokenCount)} tokens</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          <Collapsible open={comparisonOpen} onOpenChange={setComparisonOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full gap-2">
                <Columns size={16} />
                {comparisonOpen ? 'Hide' : 'Show'} Side-by-Side Comparison
                <CaretDown
                  size={16}
                  className={`transition-transform ${comparisonOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {modelResponses.map((response) => {
                  const modelBadge = getModelBadge(response.model)
                  return (
                    <Card key={response.model} className="p-4 bg-card/30">
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline" className={`text-xs ${modelBadge.color}`}>
                          {modelBadge.label}
                        </Badge>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock size={12} />
                          {formatResponseTime(response.responseTime)}
                        </div>
                      </div>
                      <div className="text-sm prose prose-sm max-w-none">
                        <MarkdownRenderer
                          content={response.content}
                          onCitationHover={onCitationHover || (() => {})}
                        />
                      </div>
                    </Card>
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {commonThemes && commonThemes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" weight="fill" />
                Common Themes
              </h4>
              <ul className="space-y-1.5">
                {commonThemes.map((theme, index) => (
                  <li
                    key={index}
                    className="text-sm pl-6 relative before:content-['•'] before:absolute before:left-2 before:text-green-500"
                  >
                    {theme}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {divergentPoints && divergentPoints.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <ArrowsLeftRight size={16} className="text-orange-500" weight="bold" />
                Divergent Points
              </h4>
              <ul className="space-y-1.5">
                {divergentPoints.map((point, index) => (
                  <li
                    key={index}
                    className="text-sm pl-6 relative before:content-['•'] before:absolute before:left-2 before:text-orange-500"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {modelResponses.map((response) => {
          const modelBadge = getModelBadge(response.model)
          return (
            <TabsContent key={response.model} value={response.model} className="mt-4">
              <Card className="p-4 bg-card/30">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{modelBadge.label}</h3>
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 h-5 ${modelBadge.color}`}>
                      {response.model}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} />
                      <span>{formatResponseTime(response.responseTime)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Hash size={14} />
                      <span>{formatTokenCount(response.tokenCount)} tokens</span>
                    </div>
                    <span>{new Date(response.generatedAt).toLocaleTimeString()}</span>
                  </div>
                </div>
                <MarkdownRenderer
                  content={response.content}
                  onCitationHover={onCitationHover || (() => {})}
                />
              </Card>
            </TabsContent>
          )
        })}

        {(commonThemes && commonThemes.length > 0) ||
        (divergentPoints && divergentPoints.length > 0) ? (
          <TabsContent value="analysis" className="mt-4">
            <div className="space-y-6">
              {commonThemes && commonThemes.length > 0 && (
                <Card className="p-4 bg-green-500/5 border-green-500/20">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle size={18} className="text-green-500" weight="fill" />
                    Areas of Agreement
                  </h3>
                  <ul className="space-y-2">
                    {commonThemes.map((theme, index) => (
                      <li
                        key={index}
                        className="text-sm leading-relaxed pl-6 relative before:content-['✓'] before:absolute before:left-2 before:text-green-500 before:font-bold"
                      >
                        {theme}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {divergentPoints && divergentPoints.length > 0 && (
                <Card className="p-4 bg-orange-500/5 border-orange-500/20">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ArrowsLeftRight size={18} className="text-orange-500" weight="bold" />
                    Differing Perspectives
                  </h3>
                  <ul className="space-y-2">
                    {divergentPoints.map((point, index) => (
                      <li
                        key={index}
                        className="text-sm leading-relaxed pl-6 relative before:content-['↔'] before:absolute before:left-2 before:text-orange-500 before:font-bold"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
