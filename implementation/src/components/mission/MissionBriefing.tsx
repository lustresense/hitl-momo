import React, { useEffect, useRef } from "react";
import type { MissionConfig } from "../../domain/mission-config";
import styles from "./MissionBriefing.module.css";
import { Icon } from "../shared/Icon";

export interface MissionBriefingProps {
  isOpen: boolean;
  config: MissionConfig;
  onStartDrawing: () => void;
  onClose?: () => void;
  characterDisplayName?: string;
}

/**
 * SISTEM-attributed pre-canvas mission guidance modal dialog.
 * Printed "typed" voice, explicitly separate from Momo (handwriting) and independent of the Top-3 panel.
 * Explicitly separate from Momo dialog and independent of Top-3 floating card.
 * Accessible with role="dialog", aria-modal="true", escape handling, focus trap, focus return.
 */
export function MissionBriefing({
  isOpen,
  config,
  onStartDrawing,
  onClose,
}: MissionBriefingProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const skipBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Parents pass inline handlers; keep the latest in refs so the listener effect only depends on isOpen.
  const dismissRef = useRef<() => void>(() => undefined);
  const tabRef = useRef<(e: KeyboardEvent) => void>(() => undefined);

  // Close handler: falls back to onClose or onStartDrawing
  const handleDismiss = () => {
    if (onClose) {
      onClose();
    } else {
      onStartDrawing();
    }
  };

  // Focus trap handler - always handle Tab to ensure proper cycling in test env
  const handleTabKey = (event: KeyboardEvent) => {
    if (!isOpen || !dialogRef.current) return;

    const focusableElements = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"
      )
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0]!;
    const lastElement = focusableElements[focusableElements.length - 1]!;
    const activeElement = document.activeElement as HTMLElement;

    if (event.key === "Tab") {
      event.preventDefault();

      if (event.shiftKey) {
        // Shift+Tab: move to previous element
        if (activeElement === firstElement || !focusableElements.includes(activeElement)) {
          lastElement.focus();
        } else {
          const currentIndex = focusableElements.indexOf(activeElement);
          focusableElements[currentIndex - 1]!.focus();
        }
      } else {
        // Tab: move to next element
        if (activeElement === lastElement || !focusableElements.includes(activeElement)) {
          firstElement.focus();
        } else {
          const currentIndex = focusableElements.indexOf(activeElement);
          focusableElements[currentIndex + 1]!.focus();
        }
      }
    }
  };

  dismissRef.current = handleDismiss;
  tabRef.current = handleTabKey;

  // Keyboard navigation, Escape handling, and focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
      }
    };
    const handleTab = (event: KeyboardEvent) => tabRef.current(event);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleTab);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleTab);
    };
  }, [isOpen]);

  // Initial focus on primary action when opened
  useEffect(() => {
    if (isOpen) {
      // Capture the opener ONLY on the closed->open edge (re-renders used to overwrite it with the dialog's own button).
      previouslyFocusedRef.current = document.activeElement as HTMLElement;
      primaryBtnRef.current?.focus();
    } else if (previouslyFocusedRef.current && previouslyFocusedRef.current.isConnected) {
      // Restore focus to previously focused element when closed
      previouslyFocusedRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const titleId = "mission-briefing-title";
  const descId = "mission-briefing-desc";

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleDismiss();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={styles.page}
        data-testid="mission-dialog"
      >
        <div className={styles.header}>
          <span className={styles.systemBadge}>{config.systemAttribution}</span>
          <button
            ref={closeBtnRef}
            type="button"
            className={styles.closeButton}
            onClick={handleDismiss}
            aria-label="Tutup Petunjuk Misi"
          >
            <Icon name="x" size={22} />
          </button>
        </div>

        <h2 id={titleId} className={styles.title}>
          {config.title}
        </h2>

        <p id={descId} className={styles.instruction}>
          {config.instruction}
        </p>

        {config.examples.length > 0 && (
          <div className={styles.examples}>
            <span className={styles.examplesLabel}>Contoh</span>
            <ul className={styles.examplesList}>
              {config.examples.map((item) => (
                <li key={item.labelId} className={styles.exampleChip}>
                  {item.icon && <span aria-hidden="true">{item.icon}</span>}
                  <span>{item.displayName}</span>
                </li>
              ))}
            </ul>
            <p className={styles.explorationNote}>{config.explorationNotice}</p>
          </div>
        )}

        <div className={styles.actions}>
          <button
            ref={skipBtnRef}
            type="button"
            className={styles.skipButton}
            data-testid="btn-mission-skip"
            onClick={handleDismiss}
          >
            Lewati
          </button>
          <button
            ref={primaryBtnRef}
            type="button"
            className={styles.primaryButton}
            data-testid="btn-mission-start"
            aria-label={`${config.primaryCtaLabel} menggambar`}
            onClick={onStartDrawing}
          >
            <Icon name="pencil" size={20} />
            {config.primaryCtaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
