import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { api, ApiError } from '@/api/client';
import { useParentLock } from '@/hooks/useParentLock';
import {
  keyToPinKey,
  parseChallengeAnswer,
  pinReducer,
  secondsLeft,
  type PinKey,
} from '@/lib/pinEntry';
import { PARENT_PIN_LENGTH } from '@/lib/theme';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { ResetChallenge } from '@/api/types';

/**
 * - `unlock`: enter the household PIN (with "Forgot PIN?" leading to `reset`).
 * - `create`: first time ever: choose a PIN (twice), then unlock with it.
 * - `reset`: forgot it: answer a sum, choose a new PIN (twice), then unlock.
 * - `change`: the lock is open: choose a new PIN (twice).
 */
export type PinPadMode = 'unlock' | 'create' | 'reset' | 'change';

type Stage = 'enter' | 'answer' | 'new' | 'confirm';

interface PinPadProps {
  mode: PinPadMode;
  /** The flow succeeded: the lock is open (for `change`: the PIN was changed). */
  onUnlocked: () => void;
  onClose: () => void;
}

const SERVER_TROUBLE = 'We couldn’t reach the server. Please try again.';

function firstStage(mode: PinPadMode): Stage {
  if (mode === 'unlock') return 'enter';
  if (mode === 'reset') return 'answer';
  return 'new';
}

function copyFor(mode: PinPadMode, stage: Stage): { title: string; hint: string } {
  if (stage === 'enter') return { title: 'Grown-ups only 🔒', hint: 'Enter your 4-digit PIN' };
  if (stage === 'answer') {
    return { title: 'Forgot your PIN?', hint: 'Answer this to choose a new one' };
  }
  if (stage === 'confirm') return { title: 'Once more', hint: 'Type the new PIN again' };
  if (mode === 'create') {
    return {
      title: 'Make a grown-ups PIN 🔒',
      hint: 'Choose 4 digits to keep the Parent corner private',
    };
  }
  return { title: 'Choose a new PIN', hint: 'Pick 4 digits you’ll remember' };
}

const KEY_CLASS =
  'min-h-[56px] rounded-2xl bg-white/5 py-3 text-parchment hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5';

export function PinPad({ mode: modeProp, onUnlocked, onClose }: PinPadProps) {
  const lock = useParentLock();
  const reduceMotion = useReducedMotion();
  const shake = useAnimationControls();

  // "Forgot PIN?" and a PIN-already-set surprise move the pad to another mode.
  const [switchedMode, setSwitchedMode] = useState<PinPadMode | null>(null);
  const mode = switchedMode ?? modeProp;

  const [stage, setStage] = useState<Stage>(() => firstStage(modeProp));
  const [pin, setPin] = useState('');
  const pinRef = useRef(''); // the truth between renders, so fast key presses never race
  const firstPin = useRef('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wait = cooldownUntil === null ? 0 : secondsLeft(cooldownUntil, now);

  const [challenge, setChallenge] = useState<ResetChallenge | null>(null);
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const answer = parseChallengeAnswer(answerText);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Take focus while open, give it back when closed.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  // Wrong-PIN cool-down: count down, then let the parent try again.
  useEffect(() => {
    if (cooldownUntil === null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (secondsLeft(cooldownUntil, t) === 0) setCooldownUntil(null);
    };
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  // The sum for "Forgot PIN?": a fresh one each time we ask (they are single-use).
  useEffect(() => {
    if (mode !== 'reset' || stage !== 'answer') return;
    let cancelled = false;
    setChallenge(null);
    setChallengeFailed(false);
    api
      .resetChallenge()
      .then((c) => {
        if (!cancelled) setChallenge(c);
      })
      .catch(() => {
        if (!cancelled) setChallengeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, stage]);

  const clearInput = () => {
    pinRef.current = '';
    setPin('');
  };

  const fail = (text: string) => {
    setMessage(text);
    if (reduceMotion) return;
    try {
      void shake.start({ x: [0, -12, 12, -8, 8, 0], transition: { duration: 0.4 } });
    } catch {
      // the pad was closed while we were waiting on the server: nothing to shake
    }
  };

  const submitUnlock = async (entered: string) => {
    setBusy(true);
    try {
      const result = await lock.unlock(entered);
      if (result === 'ok') {
        onUnlocked();
        return;
      }
      clearInput();
      if (result === 'wrong') {
        fail('Wrong PIN. Try again');
      } else {
        const t = Date.now();
        setNow(t);
        setCooldownUntil(t + result.retryAfter * 1000);
      }
    } catch {
      clearInput();
      setMessage(SERVER_TROUBLE);
    } finally {
      setBusy(false);
    }
  };

  const submitNewPin = async (entered: string) => {
    setBusy(true);
    try {
      if (mode === 'create') {
        await lock.createPin(entered);
      } else if (mode === 'change') {
        await lock.changePin(entered);
      } else if (challenge && answer !== null) {
        await lock.resetPin({ challengeId: challenge.challenge_id, answer, newPin: entered });
      } else {
        throw new Error('no challenge');
      }
      onUnlocked();
    } catch (err) {
      clearInput();
      firstPin.current = '';
      const status = err instanceof ApiError ? err.status : null;
      if (mode === 'create' && status === 409) {
        // Someone set a PIN a moment ago: ask for it instead.
        void lock.refetchStatus();
        setSwitchedMode('unlock');
        setStage('enter');
        setMessage('A PIN is already set. Enter it to continue.');
      } else if (mode === 'reset' && status === 403) {
        setAnswerText('');
        setStage('answer'); // asks for a new sum
        setMessage('That answer wasn’t right. Here’s a new question.');
      } else if (mode === 'change' && status === 401) {
        setStage('new'); // the page behind asks for the PIN again
        setMessage('The lock closed. Unlock again to change the PIN.');
      } else {
        setStage('new');
        setMessage(
          status === null ? SERVER_TROUBLE : 'We couldn’t save the PIN. Please try again.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const complete = async (entered: string) => {
    setMessage(null);
    if (stage === 'enter') {
      await submitUnlock(entered);
    } else if (stage === 'new') {
      firstPin.current = entered;
      clearInput();
      setStage('confirm');
    } else if (stage === 'confirm') {
      if (entered === firstPin.current) {
        await submitNewPin(entered);
      } else {
        firstPin.current = '';
        clearInput();
        setStage('new');
        fail('Those two PINs didn’t match. Start again.');
      }
    }
  };

  // The wrong-PIN cool-down only guards entering the PIN: choosing a new one (after
  // "Forgot PIN?") is not an unlock attempt.
  const coolingDown = wait > 0 && stage === 'enter';
  const typingAllowed = !busy && !coolingDown && stage !== 'answer';

  const apply = (key: PinKey) => {
    if (!typingAllowed) return;
    const next = pinReducer(pinRef.current, key);
    if (next === pinRef.current) return;
    pinRef.current = next;
    setPin(next);
    if (next.length === PARENT_PIN_LENGTH) void complete(next);
  };

  // Physical keyboard: digits and Backspace type, Escape closes. The handler is
  // swapped every render so it always sees the current stage.
  const latest = useRef({ apply, onClose });
  useEffect(() => {
    latest.current = { apply, onClose };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        latest.current.onClose();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = keyToPinKey(e.key);
      if (key) latest.current.apply(key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Keep Tab inside the pad while it is open.
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const items = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])'
      )
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (e.shiftKey && (here === first || here === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && here === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const goToReset = () => {
    clearInput();
    setMessage(null);
    setSwitchedMode('reset');
    setStage('answer');
  };

  const backToUnlock = () => {
    clearInput();
    setMessage(null);
    setSwitchedMode(null);
    setStage('enter');
  };

  const submitAnswer = (e: FormEvent) => {
    e.preventDefault();
    if (answer === null || !challenge) return;
    setMessage(null);
    setStage('new');
  };

  const { title, hint } = copyFor(mode, stage);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-night-900/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pinpad-title"
        tabIndex={-1}
        onKeyDown={trapTab}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="glass relative w-full max-w-xs rounded-[2rem] p-7 text-center outline-none"
      >
        <h3 id="pinpad-title" className="font-display text-xl text-parchment">
          {title}
        </h3>
        <p className="mt-1 text-sm text-parchment/70">{hint}</p>

        {coolingDown ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-blossom">
            {/* The countdown ticks silently; screen readers get one steady sentence. */}
            <span className="sr-only">Too many tries. Please wait a moment.</span>
            <span aria-hidden="true">Too many tries — wait {wait}s</span>
          </p>
        ) : (
          message !== null && (
            <p role="alert" className="mt-3 text-sm font-semibold text-blossom">
              {message}
            </p>
          )
        )}

        {stage === 'answer' ? (
          <form onSubmit={submitAnswer} className="mt-5 flex flex-col gap-3">
            {challengeFailed ? (
              <p className="text-parchment/80">
                We couldn’t get a question. Please check the connection and close this to try again.
              </p>
            ) : (
              <>
                <label htmlFor="pinpad-answer" className="text-lg text-parchment">
                  {challenge ? (
                    <>
                      What is{' '}
                      <span className="font-display text-firefly">{challenge.question}</span>?
                    </>
                  ) : (
                    'Getting a question…'
                  )}
                </label>
                <input
                  id="pinpad-answer"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={6}
                  disabled={!challenge}
                  className="min-h-[48px] w-full rounded-2xl border border-white/10 bg-night-900/40 px-4 py-2 text-center text-xl text-parchment"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!challenge || answer === null}
                  className="w-full"
                >
                  Next
                </Button>
              </>
            )}
            {modeProp === 'unlock' && (
              <Button variant="ghost" onClick={backToUnlock} className="w-full">
                Back to PIN
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} className="w-full">
              Close
            </Button>
          </form>
        ) : (
          <>
            <motion.div animate={shake}>
              <div
                role="img"
                aria-label={`${pin.length} of ${PARENT_PIN_LENGTH} digits entered`}
                className="my-5 flex justify-center gap-3"
              >
                {Array.from({ length: PARENT_PIN_LENGTH }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-4 w-4 rounded-full border-2 border-white/30',
                      i < pin.length && 'border-firefly bg-firefly'
                    )}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!typingAllowed}
                    onClick={() => apply({ type: 'digit', digit: d })}
                    className={cn(KEY_CLASS, 'font-display text-2xl')}
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Delete last digit"
                  disabled={!typingAllowed}
                  onClick={() => apply({ type: 'backspace' })}
                  className={cn(KEY_CLASS, 'text-xl')}
                >
                  ⌫
                </button>
                <button
                  type="button"
                  disabled={!typingAllowed}
                  onClick={() => apply({ type: 'digit', digit: '0' })}
                  className={cn(KEY_CLASS, 'font-display text-2xl')}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(KEY_CLASS, 'text-sm text-parchment/70')}
                >
                  Close
                </button>
              </div>
            </motion.div>
            {mode === 'unlock' && (
              <Button variant="ghost" size="md" onClick={goToReset} className="mt-3 w-full">
                Forgot PIN?
              </Button>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
