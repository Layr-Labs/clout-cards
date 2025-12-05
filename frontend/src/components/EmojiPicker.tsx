/**
 * Emoji Picker Component
 *
 * A wrapper around the emoji-picker-react library that provides
 * a popup emoji picker for the chat input.
 */

import { useRef, useEffect } from 'react';
import EmojiPickerReact, { Theme } from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';
import './EmojiPicker.css';

/**
 * Props for the EmojiPicker component
 */
interface EmojiPickerProps {
  /** Whether the picker is visible */
  isOpen: boolean;
  /** Callback when an emoji is selected */
  onEmojiSelect: (emoji: string) => void;
  /** Callback when the picker should close */
  onClose: () => void;
}

/**
 * Emoji Picker Component
 *
 * Displays a popup emoji picker that closes on outside click.
 * Uses emoji-picker-react library with dark theme to match app aesthetics.
 *
 * @param isOpen - Whether the picker is visible
 * @param onEmojiSelect - Called when an emoji is selected, receives the emoji character
 * @param onClose - Called when the picker should close (outside click or after selection)
 */
export function EmojiPicker({ isOpen, onEmojiSelect, onClose }: EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  /**
   * Handle clicks outside the picker to close it
   */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      // Delay adding listener to prevent immediate close from the click that opened it
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  /**
   * Handle emoji selection
   */
  function handleEmojiClick(emojiData: EmojiClickData) {
    onEmojiSelect(emojiData.emoji);
    // Don't close picker - let user add multiple emojis
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="emoji-picker-popup" ref={pickerRef}>
      <EmojiPickerReact
        onEmojiClick={handleEmojiClick}
        theme={Theme.DARK}
        width={320}
        height={400}
        searchPlaceholder="Search emojis..."
        previewConfig={{ showPreview: false }}
      />
    </div>
  );
}

