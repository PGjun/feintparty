export function formatToastMessage(msg) {
  if (typeof msg !== 'string') return '알 수 없는 오류가 발생했어요.';

  switch (msg) {
    case '방을 찾을 수 없어요.':
      return '코드를 확인해주세요.';
    default:
      return msg;
  }
}
