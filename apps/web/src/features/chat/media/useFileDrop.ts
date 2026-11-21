import { useEffect, useRef, useState, type DragEvent } from 'react';

const hasFiles = (e: { dataTransfer: DataTransfer | null }) =>
  Boolean(e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files'));

/**
 * Drag-and-drop of files onto an element. Ignores drags that started on the page itself (in
 * Chrome, dragging an <img> reports "Files"), and stops a missed drop from navigating the tab to
 * the file.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const internal = useRef(false);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const start = () => (internal.current = true);
    const end = () => (internal.current = false);
    const stray = (e: globalThis.DragEvent) => {
      if (hasFiles(e as unknown as { dataTransfer: DataTransfer | null })) e.preventDefault();
    };
    document.addEventListener('dragstart', start);
    document.addEventListener('dragend', end);
    window.addEventListener('dragover', stray);
    window.addEventListener('drop', stray);
    return () => {
      document.removeEventListener('dragstart', start);
      document.removeEventListener('dragend', end);
      window.removeEventListener('dragover', stray);
      window.removeEventListener('drop', stray);
    };
  }, []);

  const wanted = (e: DragEvent) => hasFiles(e) && !internal.current;

  return {
    dragging,
    handlers: {
      onDragEnter(e: DragEvent) {
        if (!wanted(e)) return;
        depth.current += 1;
        setDragging(true);
      },
      onDragOver(e: DragEvent) {
        if (!wanted(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave(e: DragEvent) {
        if (!wanted(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop(e: DragEvent) {
        if (!wanted(e)) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFilesRef.current(files);
      },
    },
  };
}
