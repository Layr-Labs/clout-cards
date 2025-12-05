/**
 * Chat Component
 *
 * Real-time chat panel for poker tables. Displays messages with Twitter avatars
 * and handles, with an emoji picker for quick emoji insertion.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaSmile, FaPaperPlane } from 'react-icons/fa';
import { EmojiPicker } from './EmojiPicker';
import type { ChatMessage } from '../services/chat';
import './Chat.css';

/**
 * Props for the Chat component
 */
interface ChatProps {
  /** Whether the chat panel is open */
  isOpen: boolean;
  /** Callback to close the chat panel */
  onClose: () => void;
  /** Array of chat messages to display */
  messages: ChatMessage[];
  /** Callback to send a new message */
  onSendMessage: (message: string) => Promise<void>;
  /** Whether the user is fully logged in (can send messages) */
  isFullyLoggedIn: boolean;
}

/**
 * Formats a timestamp into a relative time string
 *
 * @param timestamp - ISO timestamp string
 * @returns Relative time string (e.g., "2m ago", "1h ago", "just now")
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) {
    return 'just now';
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Chat Component
 *
 * Slide-in panel that displays chat messages and allows sending new messages.
 * Features:
 * - Animated slide-in/out from right side
 * - Scrollable message list with auto-scroll to bottom
 * - Twitter avatar and handle for each message
 * - Emoji picker for quick emoji insertion
 * - Disabled input for non-logged-in users
 *
 * @param isOpen - Whether the chat panel is visible
 * @param onClose - Called when close button is clicked
 * @param messages - Array of chat messages to display
 * @param onSendMessage - Called with message text when send is clicked
 * @param isFullyLoggedIn - Whether user can send messages
 */
export function Chat({ isOpen, onClose, messages, onSendMessage, isFullyLoggedIn }: ChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Auto-scroll to bottom when new messages arrive
   */
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  /**
   * Focus input when chat opens
   */
  useEffect(() => {
    if (isOpen && isFullyLoggedIn && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isFullyLoggedIn]);

  /**
   * Handle emoji selection from picker
   */
  function handleEmojiSelect(emoji: string) {
    setInputValue((prev) => prev + emoji);
    // Keep focus on input
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }

  /**
   * Handle sending a message
   */
  async function handleSend() {
    if (!inputValue.trim() || isSending || !isFullyLoggedIn) {
      return;
    }

    setIsSending(true);
    try {
      await onSendMessage(inputValue.trim());
      setInputValue('');
      setIsEmojiPickerOpen(false);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Keep the input value so user can retry
    } finally {
      setIsSending(false);
      // Refocus input after state update (setTimeout ensures it runs after re-render)
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  }

  /**
   * Handle Enter key to send message
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="chat-panel"
          initial={{ width: 0, minWidth: 0, opacity: 0 }}
          animate={{ width: 360, minWidth: 360, opacity: 1 }}
          exit={{ width: 0, minWidth: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {/* Header */}
          <div className="chat-header">
            <h3 className="chat-title">Chat</h3>
            <button
              className="chat-close-button"
              onClick={onClose}
              aria-label="Close chat"
            >
              <FaTimes />
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p>No messages yet</p>
                <p className="chat-empty-hint">Be the first to say something!</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.messageId} className="chat-message">
                  <div className="chat-message-avatar">
                    {msg.sender.twitterAvatarUrl ? (
                      <img
                        src={msg.sender.twitterAvatarUrl}
                        alt={msg.sender.twitterHandle}
                        className="chat-avatar-image"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const initial = document.createElement('div');
                            initial.className = 'chat-avatar-initial';
                            initial.textContent = msg.sender.twitterHandle.charAt(1).toUpperCase();
                            parent.appendChild(initial);
                          }
                        }}
                      />
                    ) : (
                      <div className="chat-avatar-initial">
                        {msg.sender.twitterHandle.charAt(1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="chat-message-content">
                    <div className="chat-message-header">
                      <a
                        href={`https://twitter.com/${msg.sender.twitterHandle.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chat-message-handle"
                      >
                        {msg.sender.twitterHandle}
                      </a>
                      <span className="chat-message-time">
                        {formatRelativeTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="chat-message-text">{msg.message}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="chat-input-area">
            {!isFullyLoggedIn ? (
              <div className="chat-login-prompt">
                Sign in with Twitter to chat
              </div>
            ) : (
              <>
                <div className="chat-input-container">
                  <div className="chat-emoji-button-wrapper">
                    <button
                      className="chat-emoji-button"
                      onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                      aria-label="Add emoji"
                      type="button"
                    >
                      <FaSmile />
                    </button>
                    <EmojiPicker
                      isOpen={isEmojiPickerOpen}
                      onEmojiSelect={handleEmojiSelect}
                      onClose={() => setIsEmojiPickerOpen(false)}
                    />
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    className="chat-input"
                    placeholder="Type a message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={500}
                    disabled={isSending}
                  />
                  <button
                    className="chat-send-button"
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isSending}
                    aria-label="Send message"
                    type="button"
                  >
                    <FaPaperPlane />
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

