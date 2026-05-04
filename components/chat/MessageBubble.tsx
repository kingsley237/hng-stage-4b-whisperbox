import { DecryptedMessage } from '@/types/crypto';

interface Props {
  message: DecryptedMessage;
  isSelf: boolean;
}

export default function MessageBubble({ message, isSelf }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div className={`max-w-[75%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
            message.decryptionFailed
              ? 'bg-red-500/10 border border-red-500/20 text-red-400 italic'
              : isSelf
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : 'bg-slate-800 text-slate-100 rounded-bl-sm'
          }`}
        >
          {message.decryptionFailed ? (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
              Unable to decrypt message
            </span>
          ) : (
            message.plaintext
          )}
        </div>
        <div className={`flex items-center gap-1 px-1 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs text-slate-500">{time}</span>
         {isSelf && (
            <span
              className={`text-xs font-bold leading-none ${message.delivered ? 'text-indigo-400' : 'text-slate-500'}`}
              aria-label={message.delivered ? 'Delivered' : 'Sent'}
            >
              {message.delivered ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}