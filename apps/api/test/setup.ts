// 테스트 중에 의도적으로 발생시키는 rejection/exception이
// 러너 전체에 'Unhandled'로 보고되지 않도록 no-op 핸들러를 등록합니다.
// (프로덕션 코드에서는 등록하지 않습니다.)
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});