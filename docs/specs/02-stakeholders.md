---
title: "02 - Cac ben lien quan"
sidebar_label: "02 Stakeholders"
description: "Bang cac ben lien quan cua OST: vai tro, moi quan tam, muc anh huong."
tags: [specs, stakeholders]
---

# 02 - Các bên liên quan {#stakeholders}

OST là dự án cá nhân mã nguồn do một chủ dự án phát triển với đội agent AI; không có tổ
chức/phòng ban đề xuất. Bảng dưới liệt kê các vai trò thực tế tác động đến yêu cầu.

## Bảng stakeholder

| Vai trò | Ai | Mối quan tâm chính | Ảnh hưởng |
|---------|----|--------------------|-----------|
| Chủ dự án / Product owner | nguyenhx2 | Ra quyết định sản phẩm (ngôn ngữ, lịch sử, model), duyệt ADR, duyệt PR | Cao - quyết định cuối |
| Người dùng cuối | Người dùng desktop Windows xem nội dung ngoại ngữ | Độ trễ thấp, dịch đúng, không lộ key/nội dung, máy không ì | Cao - nguồn của mọi FR |
| Provider LLM (bên ngoài) | Gemini, Anthropic, OpenAI, OpenRouter | Hợp đồng API, rate limit, định dạng response | Trung bình - ràng buộc tích hợp ([09](09-integration-interface.md)) |
| Đội phát triển (agent) | orchestrator + các dev agent chuyên trách | Spec khoá rõ ràng, tiêu chí chấp nhận đo được | Trung bình - thực thi theo specs |
| Reviewer bảo mật/spec | security-reviewer, spec-guardian | Key/nội dung capture không rò rỉ; code khớp FR | Trung bình - gate merge |

## Bối cảnh tổ chức

- Một người dùng duy nhất trên một máy; không có vai trò quản trị/nhiều tenant
  (xem [06-access-control.md](06-access-control.md)).
- Mọi quyết định sản phẩm được ghi lại: quyết định kỹ thuật vào ADR, quyết định hành vi vào
  [business-rules.md](../context/business-rules.md), thay đổi yêu cầu vào
  [13-revision-history.md](13-revision-history.md).
