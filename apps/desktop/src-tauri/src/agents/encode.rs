use crate::domain::ForestError;

pub fn encode_command_line(command: &str, args: &[String]) -> Result<String, ForestError> {
    if command.is_empty() {
        return Err(ForestError::AgentLaunchFailed(
            "agent command is empty".to_owned(),
        ));
    }

    let mut tokens = Vec::with_capacity(args.len() + 1);
    tokens.push(command);
    tokens.extend(args.iter().map(String::as_str));

    for token in &tokens {
        if token.contains('\0') || token.chars().any(char::is_control) {
            return Err(ForestError::AgentLaunchFailed(
                "agent command contains control characters".to_owned(),
            ));
        }
    }

    Ok(tokens
        .into_iter()
        .map(|token| {
            if is_safe_token(token) {
                token.to_owned()
            } else {
                posix_single_quote(token)
            }
        })
        .collect::<Vec<_>>()
        .join(" "))
}

fn is_safe_token(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '-' | '_' | '.' | '/' | '+' | '=')
        })
}

fn posix_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::encode_command_line;
    use crate::domain::ForestError;

    #[test]
    fn joins_safe_tokens_without_quotes() {
        assert_eq!(encode_command_line("codex", &[]).expect("encode"), "codex");
        assert_eq!(
            encode_command_line("claude", &["--resume".into()]).expect("encode"),
            "claude --resume"
        );
    }

    #[test]
    fn quotes_arguments_that_are_not_safe_tokens() {
        assert_eq!(
            encode_command_line("codex", &["do the work".into()]).expect("encode"),
            "codex 'do the work'"
        );
        assert_eq!(
            encode_command_line("agent", &["it's".into()]).expect("encode"),
            "agent 'it'\\''s'"
        );
    }

    #[test]
    fn does_not_embed_a_working_directory_in_the_command() {
        let encoded = encode_command_line("codex", &[]).expect("encode");
        assert_eq!(encoded, "codex");
        assert!(!encoded.contains('/'));
    }

    #[test]
    fn rejects_empty_commands_and_control_characters() {
        assert!(matches!(
            encode_command_line("", &[]).expect_err("empty"),
            ForestError::AgentLaunchFailed(_)
        ));
        assert!(matches!(
            encode_command_line("codex", &["bad\narg".into()]).expect_err("control"),
            ForestError::AgentLaunchFailed(_)
        ));
    }
}
