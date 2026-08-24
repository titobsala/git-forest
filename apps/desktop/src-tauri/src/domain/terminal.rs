use serde::{Deserialize, Serialize};

use super::forest::TerminalProviderId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalLaunchResult {
    pub provider: TerminalProviderId,
}

#[cfg(test)]
mod tests {
    use super::TerminalLaunchResult;
    use crate::domain::TerminalProviderId;

    #[test]
    fn launch_result_serializes_camel_case_json_for_the_frontend() {
        let json = serde_json::to_value(TerminalLaunchResult {
            provider: TerminalProviderId::Warp,
        })
        .expect("serialize");
        assert_eq!(json["provider"], "warp");
    }
}
