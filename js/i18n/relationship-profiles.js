/** Display-only, user-approved profile terminology. Never written into profile data.
 * Schreiner: publication pp.123–124 (18 names/groups); course slides (Double Ground).
 * Source Chinese abbreviations are documented only; software notation stays getAbbr().
 */
window.DA_I18N_PROFILE_LABELS = Object.freeze({
  'zh-Hant': Object.freeze({
    schreiner: Object.freeze({
      names: Object.freeze({
        series: '連續性', progression: '漸進性', alternative: '選擇性',
        'action-manner': '行動與方式', comparison: '比較',
        'negative-positive': '否定與肯定', 'idea-explanation': '概念與解釋',
        'question-answer': '問與答', ground: '理據', inference: '推論',
        'action-result': '行動與結果', 'action-purpose': '行動與目的',
        conditional: '條件性', temporal: '時間性', locative: '地點性',
        bilateral: '雙邊的', 'double-ground': '雙重理據',
        concessive: '讓步性', 'situation-response': '處境與回應'
      }),
      groups: Object.freeze({
        'group.coordinate': '並列關係', 'group.subordinate': '從屬關係',
        'group.restatement': '以再陳述輔助', 'group.distinct': '以額外陳述輔助',
        'group.contrary': '以對立陳述輔助'
      })
    })
  })
});
