# Business rules - OST

Quy tắc nghiệp vụ đánh số BR-NN, kèm nguồn và ngày. Cập nhật qua /sync-context khi logic
ảnh hưởng hành vi thay đổi.

| BR | Quy tắc | Nguồn | Ngày |
|----|---------|-------|------|
| BR-01 | Audio thô không bao giờ rời máy và không bao giờ ghi xuống đĩa. Ảnh chụp màn hình mặc định không rời máy: OCR mặc định chạy local. Người dùng CÓ THỂ bật một backend OCR đám mây tuỳ chọn; khi đó chỉ một crop của vùng đã chọn (không phải toàn màn hình), đã thu nhỏ và loại bỏ metadata, được gửi đến provider người dùng chọn - và chỉ sau khi người dùng đồng ý qua cổng consent per-backend (xem BR-09). Ngoài trường hợp opt-in này, chỉ TEXT tối thiểu rời máy. | ADR-002, ADR-004 | 2026-07-09 |
| BR-02 | API key chỉ tồn tại trong OS keychain; WebView chỉ thấy trạng thái masked | ADR-003 | 2026-07-09 |
| BR-03 | Kết quả dịch là đề xuất hiển thị cho người dùng - không bao giờ tự động gửi/click/gõ vào app khác | rules/human-in-the-loop.md | 2026-07-09 |
| BR-04 | Budget hiệu năng là tiêu chí chấp nhận: audio p95 < 3s, region p95 < 2s, idle RAM < 100MB / CPU < 1% | intake FR-05 | 2026-07-09 |
| BR-05 | Đoạn STT/OCR có độ tin cậy thấp phải được đánh dấu rõ, không đoán im lặng | rules/human-in-the-loop.md | 2026-07-09 |
| BR-06 | Lịch sử dịch BẬT MẶC ĐỊNH, lưu local, TEXT-ONLY (không bao giờ chứa audio/ảnh chụp/key), có nút xoá toàn bộ luôn hiển thị, người dùng tắt được | user decision | 2026-07-09 |
| BR-07 | Ngôn ngữ nguồn: whisper tự nhận diện mặc định, người dùng ghim/override thủ công được; ngôn ngữ đích cấu hình được, mặc định tiếng Việt | user decision | 2026-07-09 |
| BR-08 | Model whisper: lần chạy đầu app dò phần cứng (GPU/RAM) và gợi ý model; chỉ tải sau khi người dùng xác nhận; đổi được sau trong Settings | user decision | 2026-07-09 |
| BR-09 | OCR đám mây là opt-in per-backend, mặc định TẮT. Lần đầu một backend đám mây thực sự gửi ảnh, hệ thống hiện dialog consent nêu rõ: (1) cái gì rời máy - chỉ crop vùng đã chọn; (2) đi đâu - tên provider/endpoint; (3) chính sách lưu giữ/huấn luyện của provider. Consent thu hồi được trong Settings; khi backend đám mây đang hoạt động luôn có chỉ báo hiển thị tên backend. Gemini free-tier (huấn luyện trên nội dung gửi lên) bị CHẶN cho OCR đám mây nơi phát hiện được, hoặc yêu cầu người dùng xác nhận rủi ro huấn luyện một cách khẳng định | quyết định chủ dự án; ADR-004 | 2026-07-09 |
