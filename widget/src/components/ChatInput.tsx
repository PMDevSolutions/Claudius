import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { defaultTranslations, type ClaudiusTranslations } from "../i18n";
import type { ChatAttachment } from "../api/types";
import { AttachmentPreview } from "./AttachmentPreview";
import {
  fileToAttachment,
  formatBytes,
  validateFiles,
  type FileRejectionReason,
  type ResolvedAttachmentsConfig,
} from "../utils/attachments";
import { interpolate } from "../utils/interpolate";

const MAX_MESSAGE_LENGTH = 2000;
const WARNING_THRESHOLD = 1800;

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  isLoading: boolean;
  placeholder?: string;
  translations?: ClaudiusTranslations;
  /**
   * Attachment limits. When omitted or `null`, the attach button is hidden and
   * pasted or dropped files are ignored.
   */
  attachments?: ResolvedAttachmentsConfig | null;
}

function dragHasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  return !!types && Array.from(types).includes("Files");
}

export function ChatInput({
  onSend,
  isLoading,
  placeholder,
  translations,
  attachments = null,
}: ChatInputProps) {
  const t = translations ?? defaultTranslations;
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<ChatAttachment[]>([]);
  const dragDepthRef = useRef(0);

  const charCount = value.length;
  const isNearLimit = charCount >= WARNING_THRESHOLD;
  const isAtLimit = charCount >= MAX_MESSAGE_LENGTH;
  const placeholderText = placeholder ?? t.placeholder;
  const canAttachMore = !!attachments && pending.length < attachments.maxCount;

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const describeRejection = useCallback(
    (name: string, reason: FileRejectionReason): string => {
      if (!attachments) return "";
      switch (reason) {
        case "size":
          return interpolate(t.attachmentTooLarge, {
            name,
            max: formatBytes(attachments.maxSizeBytes),
          });
        case "type":
          return interpolate(t.attachmentTypeNotAllowed, { name });
        case "count":
          return interpolate(t.attachmentTooMany, {
            max: attachments.maxCount,
          });
      }
    },
    [attachments, t],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!attachments || files.length === 0) return;
      const { accepted, rejected } = validateFiles(
        files,
        pendingRef.current.length,
        attachments,
      );
      setAttachmentError(
        rejected.length > 0
          ? describeRejection(rejected[0].file.name, rejected[0].reason)
          : null,
      );
      if (accepted.length === 0) return;
      const converted = await Promise.all(accepted.map(fileToAttachment));
      pendingRef.current = [...pendingRef.current, ...converted];
      setPending(pendingRef.current);
    },
    [attachments, describeRejection],
  );

  const removePending = useCallback((id: string) => {
    pendingRef.current = pendingRef.current.filter((a) => a.id !== id);
    setPending(pendingRef.current);
    setAttachmentError(null);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    const files = pendingRef.current;
    if ((!trimmed && files.length === 0) || isAtLimit) return;
    if (files.length > 0) {
      onSend(trimmed, files);
    } else {
      onSend(trimmed);
    }
    setValue("");
    pendingRef.current = [];
    setPending([]);
    setAttachmentError(null);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= MAX_MESSAGE_LENGTH) {
      setValue(newValue);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset so picking the same file twice fires change again.
    e.target.value = "";
    void addFiles(files);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!attachments) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    void addFiles(files);
  };

  const handleDragEnter = (e: DragEvent<HTMLFormElement>) => {
    if (!attachments || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e: DragEvent<HTMLFormElement>) => {
    if (!attachments || !dragHasFiles(e)) return;
    e.preventDefault();
  };

  const handleDragLeave = () => {
    if (!attachments) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLFormElement>) => {
    if (!attachments) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    void addFiles(Array.from(e.dataTransfer?.files ?? []));
  };

  return (
    <form
      onSubmit={handleSubmit}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-drag-over={isDragOver || undefined}
      className={`relative border-t border-claudius-border bg-claudius-surface p-3 ${
        isDragOver ? "ring-2 ring-inset ring-claudius-accent" : ""
      }`}
    >
      {isDragOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-claudius-surface text-sm font-medium text-claudius-accent"
        >
          {t.dropFilesHint}
        </div>
      )}

      {attachments && pending.length > 0 && (
        <ul
          aria-label={t.attachmentsLabel}
          className="mb-2 flex flex-wrap gap-3 pt-1"
        >
          {pending.map((att) => (
            <li key={att.id}>
              <AttachmentPreview
                attachment={att}
                variant="composer"
                onRemove={() => removePending(att.id)}
                removeLabel={`${t.removeAttachment}: ${att.name}`}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {attachments && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              tabIndex={-1}
              accept={attachments.allowedTypes.join(",")}
              onChange={handleFileChange}
              aria-label={t.attachFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || !canAttachMore}
              aria-label={t.attachFile}
              title={t.attachFile}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-claudius-sm border border-claudius-border bg-claudius-field text-claudius-text-muted transition-colors hover:text-claudius-text focus:border-claudius-accent focus:outline-none focus:ring-1 focus:ring-claudius-accent disabled:opacity-50"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={placeholderText}
          disabled={isLoading}
          aria-label={t.typeYourMessage}
          aria-describedby={isNearLimit ? "char-count" : undefined}
          className="min-w-0 flex-1 rounded-claudius-sm border border-claudius-border bg-claudius-field px-3 py-2 text-sm font-body text-claudius-text placeholder:text-claudius-text-muted focus:border-claudius-accent focus:outline-none focus:ring-1 focus:ring-claudius-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || isAtLimit}
          aria-label={t.sendMessage}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-claudius-sm bg-claudius-accent text-claudius-accent-text transition-colors hover:opacity-90 disabled:opacity-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      {attachmentError && (
        <div role="alert" className="mt-1 text-xs text-claudius-error">
          {attachmentError}
        </div>
      )}
      {isNearLimit && (
        <div
          id="char-count"
          className={`mt-1 text-xs text-right ${isAtLimit ? "text-claudius-error" : "text-claudius-text-muted"}`}
          aria-live="polite"
        >
          {charCount}/{MAX_MESSAGE_LENGTH}
        </div>
      )}
    </form>
  );
}
