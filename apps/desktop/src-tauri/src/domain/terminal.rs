use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::forest::TerminalProviderId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalLaunchResult {
    pub provider: TerminalProviderId,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[cfg(test)]
mod tests {
    use super::TerminalLaunchResult;
    use crate::domain::TerminalProviderId;
    use chrono::{TimeZone, Utc};

    #[test]
    fn launch_result_serializes_camel_case_json_for_the_frontend() {
        let json = serde_json::to_value(TerminalLaunchResult {
            provider: TerminalProviderId::Warp,
            last_used_at: Some(Utc.with_ymd_and_hms(2026, 8, 25, 10, 0, 0).unwrap()),
        })
        .expect("serialize");
        assert_eq!(json["provider"], "warp");
        assert_eq!(json["lastUsedAt"], "2026-08-25T10:00:00Z");
    }
}
