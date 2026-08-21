use crate::domain::{ForestError, WorktreeNamingStrategy};

pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !slug.is_empty() && !dash {
            slug.push('-');
            dash = true;
        }
    }
    slug.trim_matches('-').to_owned()
}

pub fn filename_safe(value: &str, strategy: WorktreeNamingStrategy) -> String {
    match strategy {
        WorktreeNamingStrategy::BranchSlug => slugify(value),
        WorktreeNamingStrategy::BranchAsIs => {
            let mut slug = String::new();
            let mut dash = false;
            for ch in value.chars() {
                if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
                    slug.push(ch);
                    dash = false;
                } else if !slug.is_empty() && !dash {
                    slug.push('-');
                    dash = true;
                }
            }
            slug.trim_matches('-').to_owned()
        }
    }
}

pub fn validate_slug(slug: &str) -> Result<(), ForestError> {
    if slug.is_empty() || slug == "." || slug == ".." || slug.contains('/') || slug.contains('\\') {
        return Err(ForestError::EmptySlug);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{filename_safe, slugify, validate_slug};
    use crate::domain::{ForestError, WorktreeNamingStrategy};

    #[test]
    fn slugs_branch_names_without_changing_the_git_ref() {
        assert_eq!(slugify("feat/risk-483"), "feat-risk-483");
        assert_eq!(
            filename_safe("feat/Risk-483", WorktreeNamingStrategy::BranchAsIs),
            "feat-Risk-483"
        );
        assert!(matches!(
            validate_slug("..").expect_err("dotdot"),
            ForestError::EmptySlug
        ));
    }
}
