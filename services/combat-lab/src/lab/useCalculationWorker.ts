import React from 'react';

export default function useCalculationWorker<Job,Result extends {id:number;error?:string}>(makeWorker:()=>Worker){
  const [outcome,setOutcome]=React.useState<{result:Result;stamp:string;job:Job}|null>(null);
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const worker=React.useRef<Worker|null>(null);
  const serial=React.useRef(0);
  const timeout=React.useRef<ReturnType<typeof setTimeout>>();
  const stop=React.useCallback(()=>{serial.current++;worker.current?.terminate();worker.current=null;if(timeout.current)clearTimeout(timeout.current);},[]);
  React.useEffect(()=>()=>stop(),[stop]);
  const cancel=React.useCallback(()=>{stop();setBusy(false);},[stop]);
  const clear=React.useCallback(()=>{cancel();setOutcome(null);setError('');},[cancel]);
  const run=(job:Job,snapshot:string)=>{
    stop();setError('');setBusy(true);const id=serial.current;
    try{
      const instance=makeWorker();worker.current=instance;
      const fail=(message:string)=>{if(id!==serial.current)return;stop();setBusy(false);setError(message);};
      instance.onmessage=(event:MessageEvent<Result>)=>{
        if(event.data.id!==serial.current)return;
        if(timeout.current)clearTimeout(timeout.current);instance.terminate();worker.current=null;setBusy(false);
        if(event.data.error)setError(event.data.error);else{setOutcome({result:event.data,stamp:snapshot,job});}
      };
      instance.onerror=()=>fail('Не удалось завершить расчёт. Проверьте параметры и повторите.');
      timeout.current=setTimeout(()=>fail('Расчёт занял больше минуты. Уменьшите число кубиков или сложность бонусов.'),60000);
      instance.postMessage({...job,id});
    }catch{stop();setBusy(false);setError('Не удалось запустить расчёт. Обновите страницу и повторите.');}
  };
  return {result:outcome?.result||null,stamp:outcome?.stamp||'',job:outcome?.job||null,busy,error,run,cancel,clear};
}
