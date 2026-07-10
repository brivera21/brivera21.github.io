---
layout: page
title: Projects
permalink: /projects/
---

# Research Projects

Current projects in the Root Lab investigating the neural mechanisms of numerical cognition.

{% assign sorted_projects = site.projects | sort: "order" %}
{% for project in sorted_projects %}
## [{{ project.title }}]({{ project.url | relative_url }})

{{ project.summary }}

*Methods: {{ project.methods }}*
{% endfor %}
