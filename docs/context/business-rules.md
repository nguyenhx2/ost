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
