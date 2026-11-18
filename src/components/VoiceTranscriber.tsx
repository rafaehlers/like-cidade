import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

type SpeechResult = { isFinal: boolean; length: number; 0: { transcript: string } };
type SpeechResults = { length: number; [index: number]: SpeechResult };
type SpeechEvent = { resultIndex: number; results: SpeechResults };
type SpeechErrorEvent = { error: string };
type SpeechRecognitionPort = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionPort;
type SpeechWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

export default function VoiceTranscriber({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled: boolean }) {
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [interim, setInterim] = useState('');
  const recognition = useRef<SpeechRecognitionPort | undefined>(undefined);

  useEffect(() => () => {
    const current = recognition.current;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
    }
  }, []);

  useEffect(() => {
    if (!disabled || !active) return;
    const current = recognition.current;
    recognition.current = undefined;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
    }
    setActive(false);
    setInterim('');
    setStatus('Transcrição interrompida durante o envio do relato.');
  }, [active, disabled]);

  function start() {
    setError('');
    setStatus('');
    setInterim('');
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Este navegador não oferece transcrição de voz. Use a digitação por voz do teclado do dispositivo ou preencha o campo manualmente.');
      return;
    }
    try {
      const current = new SpeechRecognition();
      current.lang = 'pt-BR';
      current.continuous = false;
      current.interimResults = true;
      current.onresult = event => {
        let finalText = '';
        let interimText = '';
        for (let index = event.resultIndex; index < event.results.length; index++) {
          const result = event.results[index];
          if (result.isFinal) finalText += result[0].transcript;
          else interimText += result[0].transcript;
        }
        if (finalText.trim()) onTranscript(finalText.trim());
        setInterim(interimText.trim());
      };
      current.onerror = event => {
        setActive(false);
        setError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'O navegador não autorizou o microfone ou o serviço de transcrição.'
          : event.error === 'network'
            ? 'Não foi possível acessar o serviço de transcrição. Confira sua conexão e tente novamente.'
            : 'A transcrição foi interrompida. Tente novamente ou use a digitação por voz do dispositivo.');
      };
      current.onend = () => { setActive(false); setInterim(''); setStatus('Transcrição pausada. Você pode revisar o texto ou iniciar novamente.'); };
      current.start();
      recognition.current = current;
      setActive(true);
      setStatus('Transcrição iniciada. Fale sua mensagem; o navegador pode encerrar após reconhecer uma pausa.');
    } catch {
      setError('Não foi possível iniciar a transcrição. Confira a permissão do microfone e tente novamente.');
    }
  }

  function stop() {
    recognition.current?.stop();
    setStatus('Finalizando a transcrição…');
  }

  return <fieldset className="voice-transcriber" disabled={disabled}>
    <legend>Ditado por voz <span className="font-normal text-muted">(opcional)</span></legend>
    <p id="voice-transcriber-hint" className="voice-transcriber-hint">O navegador pode enviar sua fala ao provedor de reconhecimento de voz, e não há garantia sobre a retenção por esse provedor. A plataforma recebe e armazena apenas o texto. Revise e corrija a transcrição antes de enviar; você também pode usar o ditado do teclado ou digitar.</p>
    <label className="voice-consent"><input name="voice-transcription-consent" type="checkbox" checked={consent} disabled={active} aria-describedby="voice-transcriber-hint" onChange={event => { setConsent(event.target.checked); setError(''); }} />Entendi que o navegador ou seu provedor pode processar minha fala.</label>
    {active
      ? <button type="button" className="button-secondary" onClick={stop}><Square size={16} aria-hidden="true" />Parar transcrição</button>
      : <button type="button" className="button-secondary" aria-describedby="voice-transcriber-hint" disabled={!consent} onClick={start}><Mic size={16} aria-hidden="true" />{status ? 'Continuar transcrição' : 'Iniciar transcrição'}</button>}
    {status && <p role="status">{status}</p>}
    {interim && <p className="voice-transcriber-interim" aria-live="off">Ouvindo: {interim}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </fieldset>;
}
