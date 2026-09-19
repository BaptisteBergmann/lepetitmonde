import { CheckCircle, File, Upload, Video, X } from 'lucide-react'
import { createContext, useCallback, useContext, type PropsWithChildren } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from "@utils/utils"

import { type UseSupabaseUploadReturn } from '@utils/actions/use-supabase-upload'
import { Button } from '@/components/ui/button'

export const formatBytes = (
  bytes: number,
  decimals = 2,
  size?: 'bytes' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB' | 'EB' | 'ZB' | 'YB'
) => {
  const k = 1000
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  if (bytes === 0 || bytes === undefined) return size !== undefined ? `0 ${size}` : '0 bytes'
  const i = size !== undefined ? sizes.indexOf(size) : Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

type DropzoneContextType = Omit<UseSupabaseUploadReturn, 'getRootProps' | 'getInputProps'>

const DropzoneContext = createContext<DropzoneContextType | undefined>(undefined)

type DropzoneProps = UseSupabaseUploadReturn & {
  className?: string
}

const Dropzone = ({
  className,
  children,
  getRootProps,
  getInputProps,
  ...restProps
}: PropsWithChildren<DropzoneProps>) => {
  const isSuccess = restProps.isSuccess
  const isActive = restProps.isDragActive
  const isInvalid =
    (restProps.isDragActive && restProps.isDragReject) ||
    (restProps.errors.length > 0 && !restProps.isSuccess) ||
    restProps.files.some((file) => file.errors.length !== 0)

  return (
    <DropzoneContext.Provider value={{ ...restProps }}>
      <div
        {...getRootProps({
          className: cn(
            'border-2 border-border rounded-lg p-6 text-center bg-card transition-colors duration-300 text-foreground',
            className,
            isSuccess ? 'border-solid' : 'border-dashed',
            isActive && 'border-primary bg-primary/10',
            isInvalid && 'border-destructive bg-destructive/10'
          ),
        })}
      >
        <input {...getInputProps()} />
        {children}
      </div>
    </DropzoneContext.Provider>
  )
}
const DropzoneContent = ({ className }: { className?: string }) => {
  const t = useTranslations('dropzone')
  const tA11y = useTranslations('a11y')
  const {
    files,
    setFiles,
    loading,
    successes,
    errors,
    maxFileSize,
    maxFiles,
    isSuccess,
  } = useDropzoneContext()

  const exceedMaxFiles = files.length > maxFiles

  const handleRemoveFile = useCallback(
    (fileName: string) => {
      setFiles(files.filter((file) => file.name !== fileName))
    },
    [files, setFiles]
  )

  if (isSuccess) {
    return (
      <div className={cn('flex flex-row items-center gap-x-2 justify-center', className)}>
        <CheckCircle size={16} className="text-primary" />
        <p className="text-primary text-sm">
          {t('uploadedSuccess', { count: files.length })}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {files.map((file, idx) => {
        const fileError = errors.find((e) => e.name === file.name)
        const isSuccessfullyUploaded = !!successes.find((e) => e === file.name)

        return (
          <div
            key={`${file.name}-${idx}`}
            className="flex items-center gap-x-4 border-b py-2 first:mt-4 last:mb-4 "
          >
            {file.type.startsWith('image/') ? (
              <div className="h-10 w-10 rounded-sm border overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                <img src={file.preview} alt={file.name} className="object-cover" />
              </div>
            ) : file.type.startsWith('video/') ? (
              <div className="h-10 w-10 rounded-sm border bg-muted flex items-center justify-center shrink-0">
                <Video size={18} />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-sm border bg-muted flex items-center justify-center">
                <File size={18} />
              </div>
            )}

            <div className="shrink grow flex flex-col items-start truncate">
              <p title={file.name} className="text-sm truncate max-w-full">
                {file.name}
              </p>
              {file.errors.length > 0 ? (
                <p className="text-xs text-destructive">
                  {file.errors
                    .map((e) =>
                      e.message.startsWith('File is larger than')
                        ? t('fileTooLarge', { maxSize: formatBytes(maxFileSize, 2), fileSize: formatBytes(file.size, 2) })
                        : e.message
                    )
                    .join(', ')}
                </p>
              ) : loading && !isSuccessfullyUploaded ? (
                <p className="text-xs text-muted-foreground">{t('uploading')}</p>
              ) : !!fileError ? (
                <p className="text-xs text-destructive">{t('uploadFailed', { error: fileError.message })}</p>
              ) : isSuccessfullyUploaded ? (
                <p className="text-xs text-primary">{t('uploadedOne')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{formatBytes(file.size, 2)}</p>
              )}
            </div>

            {!loading && !isSuccessfullyUploaded && (
              <Button
                aria-label={tA11y('remove')}
                size="icon"
                variant="link"
                className="shrink-0 justify-self-end text-muted-foreground hover:text-foreground"
                onClick={() => handleRemoveFile(file.name)}
              >
                <X />
              </Button>
            )}
          </div>
        )
      })}
      {exceedMaxFiles && (
        <p className="text-sm text-left mt-2 text-destructive">
          {t('tooManyFiles', { maxFiles, excess: files.length - maxFiles })}
        </p>
      )}
    </div>
  )
}

const DropzoneEmptyState = ({ className }: { className?: string }) => {
  const t = useTranslations('dropzone')
  const { maxFiles, maxFileSize, inputRef, isSuccess } = useDropzoneContext()

  if (isSuccess) {
    return null
  }

  const uploadLabel = !maxFiles
    ? t('uploadFilesUnspecified')
    : maxFiles > 1
      ? t('uploadManyFiles', { count: maxFiles })
      : t('uploadOneFile')

  return (
    <div className={cn('flex flex-col items-center gap-y-2', className)}>
      <Upload size={20} className="text-muted-foreground" />
      <p className="text-sm">
        {uploadLabel}
      </p>
      <div className="flex flex-col items-center gap-y-1">
        <p className="text-xs text-muted-foreground">
          {t.rich(maxFiles === 1 ? 'dragDropOne' : 'dragDropMany', {
            select: (chunks) => (
              <a
                onClick={() => inputRef.current?.click()}
                className="underline cursor-pointer transition hover:text-foreground"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        {maxFileSize !== Number.POSITIVE_INFINITY && (
          <p className="text-xs text-muted-foreground">
            {t('maxFileSize', { size: formatBytes(maxFileSize, 2) })}
          </p>
        )}
      </div>
    </div>
  )
}

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext)

  if (!context) {
    throw new Error('useDropzoneContext must be used within a Dropzone')
  }

  return context
}

export { Dropzone, DropzoneContent, DropzoneEmptyState, useDropzoneContext }
