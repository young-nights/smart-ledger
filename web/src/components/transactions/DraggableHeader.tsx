/**
 * DraggableHeader — Resizable table columns with vertical dividers.
 * Column state is shared via React context for row alignment.
 */

import { useState, useCallback, useRef, useEffect, createContext, useContext, type ReactNode } from "react";

interface ColumnDef {
  key: string;
  label: string;
  minWidth?: number;
  initialWidth?: number;
  flex?: boolean;
}

interface ColumnState extends ColumnDef {
  width?: number;
}

interface DraggableContextValue {
  columns: ColumnState[];
  updateColumnWidth: (index: number, width: number) => void;
}

const DraggableContext = createContext<DraggableContextValue>({
  columns: [],
  updateColumnWidth: () => {},
});

export function useDraggableColumns() {
  return useContext(DraggableContext);
}

interface DraggableHeaderProviderProps {
  initialColumns: ColumnDef[];
  children: ReactNode;
}

export function DraggableHeaderProvider({ initialColumns, children }: DraggableHeaderProviderProps) {
  const [columns, setColumns] = useState<ColumnState[]>(() =>
    initialColumns.map((col) => ({
      ...col,
      width: col.initialWidth || (col.flex ? undefined : 100),
    }))
  );

  const updateColumnWidth = useCallback((index: number, width: number) => {
    setColumns((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], width };
      return next;
    });
  }, []);

  return (
    <DraggableContext.Provider value={{ columns, updateColumnWidth }}>
      {children}
    </DraggableContext.Provider>
  );
}

interface DraggableHeaderProps {
  onResize?: () => void;
}

export function DraggableHeader({ onResize }: DraggableHeaderProps) {
  const { columns, updateColumnWidth } = useContext(DraggableContext);
  const [dragging, setDragging] = useState<number | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(index);
      startX.current = e.clientX;
      const col = columns[index];
      startWidth.current = col.width || 100;
    },
    [columns]
  );

  useEffect(() => {
    if (dragging === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(columns[dragging].minWidth || 60, startWidth.current + diff);
      updateColumnWidth(dragging, newWidth);
      onResize?.();
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, columns, updateColumnWidth, onResize]);

  return (
    <div
      style={{
        display: "flex",
        borderBottom: "2px solid var(--border)",
        userSelect: "none",
      }}
    >
      {columns.map((col, i) => (
        <div
          key={col.key}
          style={{
            width: col.width,
            flex: col.flex ? 1 : undefined,
            position: "relative",
            padding: "10px 12px",
            fontSize: 11,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
            borderRight: i < columns.length - 1 ? "1px solid var(--border)" : "none",
            cursor: col.flex ? "default" : "col-resize",
          }}
        >
          {col.label}
          {!col.flex && (
            <div
              onMouseDown={(e) => handleMouseDown(i, e)}
              style={{
                position: "absolute",
                right: -3,
                top: 0,
                bottom: 0,
                width: 6,
                cursor: "col-resize",
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background = "var(--color-primary)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = "transparent";
              }}
            />
          )}
        </div>
      ))}
      <div style={{ width: 40, flexShrink: 0, padding: "10px 8px" }} />
    </div>
  );
}
