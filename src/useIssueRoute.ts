import { useCallback, useEffect, useState } from 'react';
import { reportIdFromPath, reportPath } from './sharing';

export function useIssueRoute() {
  const [issueId,setIssueId]=useState(()=>reportIdFromPath(window.location.pathname));
  useEffect(()=>{
    const navigate=()=>setIssueId(reportIdFromPath(window.location.pathname));
    window.addEventListener('popstate',navigate);
    return()=>window.removeEventListener('popstate',navigate);
  },[]);
  const selectIssue=useCallback((id:string|undefined)=>{
    const path=id?reportPath(id):'/';
    if(window.location.pathname!==path) {
      if(id)window.history.pushState(null,'',path);
      else window.history.replaceState(null,'',path);
    }
    setIssueId(id);
  },[]);
  return {issueId,selectIssue};
}
