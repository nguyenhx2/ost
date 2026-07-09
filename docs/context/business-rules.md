# Business rules - OST

Quy tắc nghiệp vụ đánh số BR-NN, kèm nguồn và ngày. Cập nhật qua /sync-context khi logic
ảnh hưởng hành vi thay đổi.

| BR | Quy tắc | Nguồn | Ngày |
|----|---------|-------|------|
| BR-01 | Audio thô không bao giờ rời máy và không bao giờ ghi xuống đĩa; chỉ TEXT tối thiểu được gửi đến provider người dùng chọn | ADR-002 | 2026-07-09 |
| BR-02 | API key chỉ tồn tại trong OS keychain; WebView chỉ thấy trạng thái masked | ADR-003 | 2026-07-09 |
| BR-03 | Kết quả dịch là đề xuất hiển thị cho người dùng - không bao giờ tự động gửi/click/gõ vào app khác | rules/human-in-the-loop.md | 2026-07-09 |
| BR-04 | Budget hiệu năng là tiêu chí chấp nhận: audio p95 < 3s, region p95 < 2s, idle RAM < 100MB / CPU < 1% | intake FR-05 | 2026-07-09 |
| BR-05 | Đoạn STT/OCR có độ tin cậy thấp phải được đánh dấu rõ, không đoán im lặng | rules/human-in-the-loop.md | 2026-07-09 |
| BR-06 | Lịch sử dịch BẬT MẶC ĐỊNH, lưu local, TEXT-ONLY (không bao giờ chứa audio/ảnh chụp/key), có nút xoá toàn bộ luôn hiển thị, người dùng tắt được | user decision | 2026-07-09 |
| BR-07 | Ngôn ngữ nguồn: whisper tự nhận diện mặc định, người dùng ghim/override thủ công được; ngôn ngữ đích cấu hình được, mặc định tiếng Việt | user decision | 2026-07-09 |
| BR-08 | Model whisper: lần chạy đầu app dò phần cứng (GPU/RAM) và gợi ý model; chỉ tải sau khi người dùng xác nhận; đổi được sau trong Settings | user decision | 2026-07-09 |
