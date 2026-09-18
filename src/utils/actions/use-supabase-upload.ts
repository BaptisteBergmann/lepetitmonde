import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone, type FileError, type FileRejection } from 'react-dropzone'
import { useTranslations } from 'next-intl'

export async function uploadFile(
  bucketName: string,
  path: string,
  file: File | Blob,
  options: { cacheControl: string; upsert: boolean },
  formatStatusError: (status: number) => string = (status) => `Upload failed (${status})`
) {
  const params = new URLSearchParams({
    bucket: bucketName,
    path,
    cacheControl: options.cacheControl,
    upsert: String(options.upsert),
  })

  const response = await fetch(`/api/upload?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })

  const fallbackFilename = path.split('/').pop()
  try {
    const { error, filename, thumbnailFilename, contentType } = await response.json()
    return {
      error: error ?? undefined,
      filename: filename ?? fallbackFilename,
      thumbnailFilename: thumbnailFilename as string | undefined,
      contentType: contentType as string | undefined,
    }
  } catch {
    return { error: formatStatusError(response.status), filename: fallbackFilename, thumbnailFilename: undefined, contentType: undefined }
  }
}

interface FileWithPreview extends File {
  preview?: string
  errors: readonly FileError[]
}

type UseSupabaseUploadOptions = {
  /**
   * Name of bucket to upload files to in your Supabase project
   */
  bucketName: string
  /**
   * Folder to upload files to in the specified bucket within your Supabase project.
   *
   * Defaults to uploading files to the root of the bucket
   *
   * e.g If specified path is `test`, your file will be uploaded as `test/file_name`
   */
  path?: string
  /**
   * Allowed MIME types for each file upload (e.g `image/png`, `text/html`, etc). Wildcards are also supported (e.g `image/*`).
   *
   * Defaults to allowing uploading of all MIME types.
   */
  allowedMimeTypes?: string[]
  /**
   * Maximum upload size of each file allowed in bytes. (e.g 1000 bytes = 1 KB)
   */
  maxFileSize?: number
  /**
   * Maximum number of files allowed per upload.
   */
  maxFiles?: number
  /**
   * The number of seconds the asset is cached in the browser and in the Supabase CDN.
   *
   * This is set in the Cache-Control: max-age=<seconds> header. Defaults to 3600 seconds.
   */
  cacheControl?: number
  /**
   * When set to true, the file is overwritten if it exists.
   *
   * When set to false, an error is thrown if the object already exists. Defaults to `false`
   */
  upsert?: boolean
}

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const t = useTranslations('dropzone')
  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
  } = options

  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([])
  const [successes, setSuccesses] = useState<string[]>([])
  const [finalNames, setFinalNames] = useState<Record<string, string>>({})
  const [finalThumbnails, setFinalThumbnails] = useState<Record<string, string>>({})
  const [finalContentTypes, setFinalContentTypes] = useState<Record<string, string>>({})

  const isSuccess = useMemo(() => {
    if (errors.length === 0 && successes.length === 0) {
      return false
    }
    if (errors.length === 0 && successes.length === files.length) {
      return true
    }
    return false
  }, [errors.length, successes.length, files.length])

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const validFiles = acceptedFiles
        .filter((file) => !files.find((x) => x.name === file.name))
        .map((file) => {
          ; (file as FileWithPreview).preview = URL.createObjectURL(file)
            ; (file as FileWithPreview).errors = []
          return file as FileWithPreview
        })

      const invalidFiles = fileRejections.map(({ file, errors }) => {
        ; (file as FileWithPreview).preview = URL.createObjectURL(file)
          ; (file as FileWithPreview).errors = errors
        return file as FileWithPreview
      })

      const newFiles = [...files, ...validFiles, ...invalidFiles]

      setFiles(newFiles)
    },
    [files, setFiles]
  )

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    maxFiles: maxFiles,
    multiple: maxFiles !== 1,
  })

  const onUpload = useCallback(async () => {
    setLoading(true)

    // [Joshen] This is to support handling partial successes
    // If any files didn't upload for any reason, hitting "Upload" again will only upload the files that had errors
    const filesWithErrors = errors.map((x) => x.name)
    const filesToUpload =
      filesWithErrors.length > 0
        ? [
          ...files.filter((f) => filesWithErrors.includes(f.name)),
          ...files.filter((f) => !successes.includes(f.name)),
        ]
        : files

    const responses = await Promise.all(
      filesToUpload.map(async (file) => {
        const { error, filename, thumbnailFilename, contentType } = await uploadFile(
          bucketName,
          !!path ? `${path}/${file.name}` : file.name,
          file,
          { cacheControl: cacheControl.toString(), upsert },
          (status) => t('uploadFailedWithStatus', { status })
        )
        if (error) {
          return { name: file.name, message: error, filename: undefined, thumbnailFilename: undefined, contentType: undefined }
        } else {
          return { name: file.name, message: undefined, filename, thumbnailFilename, contentType }
        }
      })
    )

    const responseErrors = responses.filter(
      (x): x is { name: string; message: string; filename: undefined; thumbnailFilename: undefined; contentType: undefined } => x.message !== undefined
    )
    // if there were errors previously, this function tried to upload the files again so we should clear/overwrite the existing errors.
    setErrors(responseErrors)

    const responseSuccesses = responses.filter(
      (x): x is { name: string; message: undefined; filename: string; thumbnailFilename: string | undefined; contentType: string | undefined } => x.message === undefined
    )
    const newSuccesses = Array.from(
      new Set([...successes, ...responseSuccesses.map((x) => x.name)])
    )
    setSuccesses(newSuccesses)

    const newFinalNames = Object.fromEntries(responseSuccesses.map((x) => [x.name, x.filename ?? x.name]))
    setFinalNames((prev) => ({ ...prev, ...newFinalNames }))

    const newFinalThumbnails = Object.fromEntries(
      responseSuccesses.filter((x) => x.thumbnailFilename).map((x) => [x.name, x.thumbnailFilename as string])
    )
    setFinalThumbnails((prev) => ({ ...prev, ...newFinalThumbnails }))

    const newFinalContentTypes = Object.fromEntries(
      responseSuccesses.filter((x) => x.contentType).map((x) => [x.name, x.contentType as string])
    )
    setFinalContentTypes((prev) => ({ ...prev, ...newFinalContentTypes }))

    setLoading(false)

    // Returned directly (rather than relying on callers to read back `successes`/`finalNames`/
    // `finalThumbnails`/`finalContentTypes` state after awaiting) since state updates above
    // aren't visible in the caller's closure yet.
    return { names: newFinalNames, thumbnails: newFinalThumbnails, contentTypes: newFinalContentTypes }
  }, [files, path, bucketName, errors, successes])

  useEffect(() => {
    if (files.length === 0) {
      // Re-derives from the current file list as a whole (paired below with the
      // maxFiles trim), not a simple one-state-from-one-prop sync, so this stays
      // in an effect rather than the render-time "adjust state" pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrors([])
    }

    // If the number of files doesn't exceed the maxFiles parameter, remove the error 'Too many files' from each file
    if (files.length <= maxFiles) {
      let changed = false
      const newFiles = files.map((file) => {
        if (file.errors.some((e) => e.code === 'too-many-files')) {
          file.errors = file.errors.filter((e) => e.code !== 'too-many-files')
          changed = true
        }
        return file
      })
      if (changed) {
        setFiles(newFiles)
      }
    }
  }, [files.length, setFiles, maxFiles])

  return {
    files,
    setFiles,
    successes,
    finalNames,
    finalThumbnails,
    finalContentTypes,
    isSuccess,
    loading,
    errors,
    setErrors,
    onUpload,
    maxFileSize: maxFileSize,
    maxFiles: maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  }
}

export { useSupabaseUpload, type UseSupabaseUploadOptions, type UseSupabaseUploadReturn }
