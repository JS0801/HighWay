/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/log'], function (log) {
  var INLINE_HTML_FIELD = 'custrecord_bc_payment_applied_view';
  var SUITELET_SCRIPT_ID = '2549';
  var SUITELET_DEPLOYMENT_ID = '1';

  function beforeLoad(context) {
    var projectId = context.newRecord ? context.newRecord.id : '';
    var field;
    var suiteletUrl;

    try {
      log.debug({
        title: 'Payment Applied View UE start',
        details: {
          eventType: context.type,
          recordType: context.newRecord ? context.newRecord.type : '',
          projectId: projectId
        }
      });

      if (!projectId) {
        log.debug({
          title: 'Payment Applied View UE skipped',
          details: 'No current record id found.'
        });
        return;
      }

      field = context.form.getField({
        id: INLINE_HTML_FIELD
      });

      if (!field) {
        log.error({
          title: 'Payment Applied View UE skipped',
          details: 'Inline HTML field not found on form: ' + INLINE_HTML_FIELD
        });
        return;
      }

      suiteletUrl = buildSuiteletUrl(projectId);
      field.defaultValue = buildLazyIframeHtml(suiteletUrl);

      log.debug({
        title: 'Payment Applied View UE complete',
        details: {
          projectId: projectId,
          suiteletUrl: suiteletUrl
        }
      });
    } catch (error) {
      log.error({
        title: 'Payment Applied View UE error',
        details: error
      });
    }
  }

  function buildSuiteletUrl(projectId) {
    return '/app/site/hosting/scriptlet.nl?script=' +
      encodeURIComponent(SUITELET_SCRIPT_ID) +
      '&deploy=' +
      encodeURIComponent(SUITELET_DEPLOYMENT_ID) +
      '&project_id=' +
      encodeURIComponent(projectId);
  }

  function buildLazyIframeHtml(suiteletUrl) {
    var containerId = 'bc-payment-applied-view';
    var escapedUrl = escapeHtml(suiteletUrl);
    var scriptUrl = escapeJs(suiteletUrl);

    return '' +
      '<div id="' + containerId + '" style="width:100%;min-height:180px;border:1px solid #d0d5dd;background:#fff;">' +
      '<div id="' + containerId + '-placeholder" style="padding:16px;color:#667085;font-family:Arial,sans-serif;font-size:13px;">Loading payment view...</div>' +
      '<noscript><iframe src="' + escapedUrl + '" style="width:100%;min-height:900px;border:0;"></iframe></noscript>' +
      '</div>' +
      '<script>' +
      '(function(){' +
      'var holder=document.getElementById("' + containerId + '");' +
      'var placeholder=document.getElementById("' + containerId + '-placeholder");' +
      'var started=false;' +
      'function load(){' +
      'if(started||!holder)return;' +
      'started=true;' +
      'var frame=document.createElement("iframe");' +
      'frame.src="' + scriptUrl + '";' +
      'frame.loading="lazy";' +
      'frame.style.cssText="width:100%;min-height:900px;border:0;display:block;";' +
      'frame.onload=function(){if(placeholder){placeholder.style.display="none";}};' +
      'holder.appendChild(frame);' +
      '}' +
      'if("IntersectionObserver" in window){' +
      'var observer=new IntersectionObserver(function(entries){' +
      'if(entries[0]&&entries[0].isIntersecting){observer.disconnect();load();}' +
      '},{root:null,rootMargin:"250px",threshold:0});' +
      'observer.observe(holder);' +
      '}else{' +
      'setTimeout(load,250);' +
      '}' +
      '}());' +
      '</script>';
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJs(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/</g, '\\u003c');
  }

  return {
    beforeLoad: beforeLoad
  };
});
