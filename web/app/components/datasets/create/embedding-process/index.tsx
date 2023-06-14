import type { FC } from 'react'
import React, { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { omit } from 'lodash-es'
import { ArrowRightIcon } from '@heroicons/react/24/solid'
import { useGetState } from 'ahooks'
import cn from 'classnames'
import s from './index.module.css'
import { FieldInfo } from '@/app/components/datasets/documents/detail/metadata'
import Button from '@/app/components/base/button'
import type { FullDocumentDetail, IndexingStatusResponse, ProcessRuleResponse } from '@/models/datasets'
import { formatNumber } from '@/utils/format'
import { fetchIndexingStatusBatch as doFetchIndexingStatus, fetchIndexingEstimateBatch, fetchProcessRule } from '@/service/datasets'
import { DataSourceType } from '@/models/datasets'
// import NotionIcon from '@/app/components/base/notion-icon'

type Props = {
  datasetId: string
  batchId: string
  documents?: FullDocumentDetail[]
  indexingType?: string
}

const RuleDetail: FC<{ sourceData?: ProcessRuleResponse }> = ({ sourceData }) => {
  const { t } = useTranslation()

  const segmentationRuleMap = {
    mode: t('datasetDocuments.embedding.mode'),
    segmentLength: t('datasetDocuments.embedding.segmentLength'),
    textCleaning: t('datasetDocuments.embedding.textCleaning'),
  }

  const getRuleName = (key: string) => {
    if (key === 'remove_extra_spaces')
      return t('datasetCreation.stepTwo.removeExtraSpaces')

    if (key === 'remove_urls_emails')
      return t('datasetCreation.stepTwo.removeUrlEmails')

    if (key === 'remove_stopwords')
      return t('datasetCreation.stepTwo.removeStopwords')
  }

  const getValue = useCallback((field: string) => {
    let value: string | number | undefined = '-'
    switch (field) {
      case 'mode':
        value = sourceData?.mode === 'automatic' ? (t('datasetDocuments.embedding.automatic') as string) : (t('datasetDocuments.embedding.custom') as string)
        break
      case 'segmentLength':
        value = sourceData?.rules?.segmentation?.max_tokens
        break
      default:
        value = sourceData?.mode === 'automatic'
          ? (t('datasetDocuments.embedding.automatic') as string)
          // eslint-disable-next-line array-callback-return
          : sourceData?.rules?.pre_processing_rules?.map((rule) => {
            if (rule.enabled)
              return getRuleName(rule.id)
          }).filter(Boolean).join(';')
        break
    }
    return value
  }, [sourceData])

  return <div className='flex flex-col pt-8 pb-10 first:mt-0'>
    {Object.keys(segmentationRuleMap).map((field) => {
      return <FieldInfo
        key={field}
        label={segmentationRuleMap[field as keyof typeof segmentationRuleMap]}
        displayedValue={String(getValue(field))}
      />
    })}
  </div>
}

const EmbeddingProcess: FC<Props> = ({ datasetId, batchId, documents = [], indexingType }) => {
  const { t } = useTranslation()

  const getFirstDocument = documents[0]

  const [indexingStatusBatchDetail, setIndexingStatusDetail, getIndexingStatusDetail] = useGetState<IndexingStatusResponse[]>([])
  const fetchIndexingStatus = async () => {
    const status = await doFetchIndexingStatus({ datasetId, batchId })
    setIndexingStatusDetail(status.data)
  }

  const [runId, setRunId, getRunId] = useGetState<any>(null)

  const stopQueryStatus = () => {
    clearInterval(getRunId())
  }

  const startQueryStatus = () => {
    const runId = setInterval(() => {
      const indexingStatusBatchDetail = getIndexingStatusDetail()
      const isCompleted = indexingStatusBatchDetail.every(indexingStatusDetail => ['completed', 'error'].includes(indexingStatusDetail.indexing_status))
      if (isCompleted) {
        stopQueryStatus()
        return
      }
      fetchIndexingStatus()
    }, 2500)
    setRunId(runId)
  }

  useEffect(() => {
    fetchIndexingStatus()
    startQueryStatus()
    return () => {
      stopQueryStatus()
    }
  }, [])

  // get rule
  const { data: ruleDetail, error: ruleError } = useSWR({
    action: 'fetchProcessRule',
    params: { documentId: getFirstDocument.id },
  }, apiParams => fetchProcessRule(omit(apiParams, 'action')), {
    revalidateOnFocus: false,
  })
  // get cost
  const { data: indexingEstimateDetail, error: indexingEstimateErr } = useSWR({
    action: 'fetchIndexingEstimateBatch',
    datasetId,
    batchId,
  }, apiParams => fetchIndexingEstimateBatch(omit(apiParams, 'action')), {
    revalidateOnFocus: false,
  })

  const router = useRouter()
  const navToDocumentList = () => {
    router.push(`/datasets/${datasetId}/documents`)
  }

  const isEmbedding = useMemo(() => {
    return indexingStatusBatchDetail.some((indexingStatusDetail: { indexing_status: any }) => ['indexing', 'splitting', 'parsing', 'cleaning'].includes(indexingStatusDetail?.indexing_status || ''))
  }, [indexingStatusBatchDetail])
  const isEmbeddingCompleted = useMemo(() => {
    return indexingStatusBatchDetail.every((indexingStatusDetail: { indexing_status: any }) => ['completed', 'error'].includes(indexingStatusDetail?.indexing_status || ''))
  }, [indexingStatusBatchDetail])

  const getSourceName = (id: string) => {
    const doc = documents.find(document => document.id === id)
    return doc?.name
  }
  const getSourcePercent = (detail: IndexingStatusResponse) => {
    const completedCount = detail.completed_segments || 0
    const totalCount = detail.total_segments || 0
    if (totalCount === 0)
      return 0
    const percent = Math.round(completedCount * 100 / totalCount)
    return percent > 100 ? 100 : percent
  }
  const getSourceType = (id: string) => {
    const doc = documents.find(document => document.id === id)
    return doc?.data_source_type as DataSourceType
  }
  // TODO
  // const getIcon = (id: string) => {
  //   const doc = documents.find(document => document.id === id)
  //   let iconSrc
  //   if (notionPages.length > 0) {
  //     if (notionPages[0].page_icon && notionPages[0].page_icon.type === 'url')
  //       iconSrc = notionPages[0].page_icon.url
  //     if (notionPages[0].page_icon && notionPages[0].page_icon.type === 'emoji')
  //       iconSrc = notionPages[0].page_icon.emoji
  //   }
  //   return iconSrc
  // }
  const isSourceEmbedding = (detail: IndexingStatusResponse) => ['indexing', 'splitting', 'parsing', 'cleaning', 'waiting'].includes(detail.indexing_status || '')

  return (
    <>
      <div className='h-5 flex justify-between items-center mb-5'>
        <div className={s.embeddingStatus}>
          {isEmbedding && t('datasetDocuments.embedding.processing')}
          {isEmbeddingCompleted && t('datasetDocuments.embedding.completed')}
        </div>
        <div className={s.cost}>
          {indexingType === 'high_quaility' && (
            <div className='flex items-center'>
              <div className={cn(s.commonIcon, s.highIcon)} />
              {t('datasetDocuments.embedding.highQuality')} · {t('datasetDocuments.embedding.estimate')}
              <span className={s.tokens}>{formatNumber(indexingEstimateDetail?.tokens || 0)}</span>tokens
              (<span className={s.price}>${formatNumber(indexingEstimateDetail?.total_price || 0)}</span>)
            </div>
          )}
          {indexingType === 'economy' && (
            <div className='flex items-center'>
              <div className={cn(s.commonIcon, s.economyIcon)} />
              {t('datasetDocuments.embedding.economy')} · {t('datasetDocuments.embedding.estimate')}
              <span className={s.tokens}>0</span>tokens
            </div>
          )}
        </div>
      </div>
      <div className={s.progressContainer}>
        {indexingStatusBatchDetail.map(indexingStatusDetail => (
          <div className={cn(
            s.sourceItem,
            indexingStatusDetail.indexing_status === 'error' && s.error,
            indexingStatusDetail.indexing_status === 'completed' && s.success,
          )}>
            <div className={s.progressbar} style={{ width: `${getSourcePercent(indexingStatusDetail)}%` }}/>
            <div className={s.info}>
              {getSourceType(indexingStatusDetail.id) === DataSourceType.FILE && (
                <div className={s.type}></div>
              )}
              {/* {getSourceType(indexingStatusDetail.id) === DataSourceType.NOTION && (
                <NotionIcon
                  className='shrink-0 mr-1'
                  type='page'
                  src={getIcon(indexingStatusDetail.id)}
                />
              )} */}
              <div className={s.name}>{getSourceName(indexingStatusDetail.id)}</div>
            </div>
            <div className='shrink-0'>
              {isSourceEmbedding(indexingStatusDetail) && (
                <div className={s.percent}>{`${getSourcePercent(indexingStatusDetail)}%`}</div>
              )}
              {indexingStatusDetail.indexing_status === 'error' && (
                <div className={s.error}>Error%</div>
              )}
              {indexingStatusDetail.indexing_status === 'completed' && (
                <div className={s.success}>100%</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <RuleDetail sourceData={ruleDetail} />
      <div className='flex items-center gap-2 mt-10'>
        <Button className='w-fit' type='primary' onClick={navToDocumentList}>
          <span>{t('datasetCreation.stepThree.navTo')}</span>
          <ArrowRightIcon className='h-4 w-4 ml-2 stroke-current stroke-1' />
        </Button>
      </div>
    </>
  )
}

export default EmbeddingProcess
